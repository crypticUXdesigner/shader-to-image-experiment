import type { NodeGraph } from '../../data-model/types';
import type { NodeSpec, PortType } from '../../types/nodeSpec';
import type { AudioSetup } from '../../data-model/audioSetupTypes';
import type { CompilationResult, ParamLayout, UniformMetadata, WebGpuPassPlan, WebGpuTextureDesc } from '../../runtime/types';
import {
  BLUR_GAUSSIAN_SEPARABLE_BLUR_WGSL,
  BLUR_GAUSSIAN_SEPARABLE_PRESENT_WGSL
} from './blurGaussianSeparableV1Wgsl';
import {
  GLOW_BLOOM_BLUR_WGSL,
  GLOW_BLOOM_COMBINE_WGSL,
  GLOW_BLOOM_THRESHOLD_WGSL
} from './glowBloomV1Wgsl';
import {
  CREPUSCULAR_RAYS_COMBINE_WGSL,
  CREPUSCULAR_RAYS_OCCLUDER_WGSL,
  CREPUSCULAR_RAYS_SWEEP_WGSL
} from './crepuscularRaysV1Wgsl';
import {
  BOKEH_BLUR_WGSL,
  BOKEH_COMBINE_WGSL,
  BOKEH_THRESHOLD_WGSL
} from './bokehV1Wgsl';
import { INFLATED_ICOSAHEDRON_MVP_WGSL } from './inflatedIcosahedronMvpWgsl';
import { UniformGenerator } from './UniformGenerator';
import { getParameterDefaultValue as getParameterDefaultValueHelper, isAudioNode as isAudioNodeHelper } from './NodeShaderCompilerHelpers';
import {
  GENERIC_RAYMARCHER_WEBGPU_MVP_SDF_TYPES,
  genericRaymarcherWebGpuMvpSdfAllowedListSentence,
} from './genericRaymarcherWebGpuMvpAllowlist';
import { VIRTUAL_NODE_PREFIX } from '../../utils/virtualNodes';
import { RADIAL_PULSE_SPAWN_SLOT_COUNT, radialPulseSpawnTimelineParam } from '../nodes/radial-pulse';
import { TURBULENCE_TIME_INTRINSIC_SCALE } from '../nodes/turbulence';
import {
  arrangementLanesGlslSuffix,
  buildArrangementLanesWgslNodeHelper,
  filterRegionsForNode,
} from '../arrangement/packArrangementRegionsForGlsl';
import {
  buildArrangementNotesWgslNodeHelper,
  filterNotesForNode,
} from '../arrangement/packArrangementNotesForGlsl';

type WgslType = 'f32' | 'vec2<f32>' | 'vec3<f32>' | 'vec4<f32>';

type Expr = { type: WgslType; code: string };

export const WGSL_SUPPORTED_NODE_TYPES = new Set([
  'constant-float',
  'constant-vec2',
  'constant-vec3',
  'constant-vec4',
  'uv-coordinates',
  'time',
  'resolution',
  'fragment-coordinates',
  'oscillator-2d',
  'particle-system',
  'orbit-camera',
  'look-at-camera',
  'rotate',
  'scale',
  'transform',
  'polar-coordinates',
  'brick-tiling',
  'mirror-flip',
  'mixed-wave-signal',
  'displace',
  'displacement-3d',
  'drive-home-lights',
  'radial-uv-warp',
  'infinite-zoom',
  'iridescent-tunnel',
  'kaleidoscope',
  'quad-warp',
  'rain-drops',
  'ripple',
  'turbulence',
  'vector-field',
  'vortex',
  'uv-band-shift',
  'uv-block-glitch',
  'shapes-2d',
  'star-shape-2d',
  'add',
  'subtract',
  'multiply',
  'divide',
  'power',
  'square-root',
  'modulo',
  'mix',
  'clamp',
  'step',
  'smoothstep',
  'min',
  'max',
  'fract',
  'absolute',
  'sine',
  'cosine',
  'tangent',
  'arc-sine',
  'arc-cosine',
  'arc-tangent',
  'arc-tangent-2',
  'arrangement-lanes',
  'arrangement-notes',
  'exponential',
  'natural-logarithm',
  'lerp',
  'saturate',
  'clamp-01',
  'one-minus',
  'negate',
  'dot-product',
  'cross-product',
  'length',
  'normalize',
  'distance',
  'compare',
  'select',
  'mask-composite-float',
  'mask-composite-vec2',
  'mask-composite-vec3',
  'reflect',
  'refract',
  'hash32',
  'gradient',
  'noise',
  'voronoi-noise',
  'volume-rays',
  'cubic-curl-noise',
  'warp-terrain',
  'bayer-dither',
  'oklch-color',
  'bezier-curve',
  'blend-color',
  'blend-mode',
  'scanlines',
  'stripes',
  'dots',
  'rings',
  'radial-pulse',
  'triangle-grid',
  'disco-pattern',
  'hexagonal-grid',
  'flow-field-pattern',
  'fractal',
  'radial-rays',
  'streak',
  'iterated-inversion',
  'bokeh',
  'blur',
  'bokeh-point',
  'plane-grid',
  'sky-dome',
  'lighting-shading',
  'normal-mapping',
  'spherical-fibonacci',
  'bloom-sphere',
  'sphere-raymarch',
  'tone-mapping',
  'color-grading',
  'oklch-color-map-threshold',
  'oklch-color-map-bezier',
  'reciprocal',
  'sign',
  'floor',
  'ceil',
  'round',
  'truncate',
  'combine-vector',
  'split-vector',
  'swizzle',
  'chromatic-aberration',
  'rgb-separation',
  'generic-raymarcher',
  'glass-shell',
  'inflated-icosahedron',
  'metaballs',
  'box-torus-sdf',
  'mandelbulb-sdf',
  'julia-slab-sdf',
  'mandelbox-sdf',
  'kifs-sdf',
  'menger-sponge-sdf',
  'sierpinski-tetra-sdf',
  'final-output',
  'edge-detection',
  'ether-sdf',
  'hex-prism-sdf',
  'radial-repeat-sdf',
  'repeated-hex-prism-sdf',
]);

/**
 * Node types emitted as {@link CompilationResult.webgpuPassPlan} (multi-pass/compute pilot path).
 * Most are omitted from {@link WGSL_SUPPORTED_NODE_TYPES} fullscreen inline codegen.
 * Exception: **`bokeh`** and **`blur`** also have inline WGSL (GLSL-parity single-pass stubs) so
 * graphs like `blur → blend-color → final-output` compile on WebGPU; each pass plan still takes
 * precedence when topology is `… → bokeh → final-output` / `… → blur → final-output`.
 *
 * Grow this set only alongside a matching compiler branch + runtime/export handlers.
 */
export const WGSL_WEBGPU_PASS_PLAN_NODE_TYPES = new Set<string>([
  'blur',
  'glow-bloom',
  'bokeh',
  'crepuscular-rays',
]);

/**
 * Try to emit a `pass.bokeh.v1` pass plan for a graph that ends in
 * `... -> bokeh -> final-output`. The upstream subgraph is compiled as inline WGSL,
 * then runtime performs bright-pass, shaped blur, and combine.
 */
function tryCompileBokehPassPlan(
  graph: NodeGraph,
  nodeSpecs: Map<string, NodeSpec>,
  executionOrder: string[],
  finalOutputNodeId: string,
  audioSetup: AudioSetup | null,
  bokehNodeId: string
): CompilationResult | null {
  const bokehToFinal = graph.connections.find(
    (c) =>
      c.sourceNodeId === bokehNodeId &&
      c.sourcePort === 'out' &&
      c.targetNodeId === finalOutputNodeId &&
      c.targetPort === 'in'
  );
  if (!bokehToFinal) return null;

  const bokehInLink = lookupInputConnection(graph, bokehNodeId, 'in');
  if (!bokehInLink) {
    return {
      backend: 'webgpu',
      supported: false,
      unsupportedReasons: ['pass.bokeh.v1: bokeh node has no upstream input'],
      code: '',
      shaderCode: '',
      uniforms: [],
      metadata: { warnings: [], errors: [], executionOrder, finalOutputNodeId },
      paramLayout: {},
      resources: [],
    };
  }

  const subGraph: NodeGraph = {
    ...graph,
    nodes: graph.nodes.filter((n) => n.id !== bokehNodeId),
    connections: [
      ...graph.connections.filter((c) => c.sourceNodeId !== bokehNodeId && c.targetNodeId !== bokehNodeId),
      {
        id: `__synthetic.bokeh-bypass.${bokehNodeId}`,
        sourceNodeId: bokehInLink.sourceNodeId,
        sourcePort: bokehInLink.sourcePort,
        targetNodeId: finalOutputNodeId,
        targetPort: 'in',
      },
    ],
  };

  const subOrder = executionOrder.filter((id) => id !== bokehNodeId);
  const subResult = compileWgslMvp(subGraph, nodeSpecs, subOrder, finalOutputNodeId, audioSetup);
  if (!subResult.supported) {
    const reasons = subResult.unsupportedReasons ?? ['unknown subgraph compile failure'];
    return {
      backend: 'webgpu',
      supported: false,
      unsupportedReasons: ['pass.bokeh.v1: upstream subgraph not WGSL-compatible', ...reasons],
      code: '',
      shaderCode: '',
      uniforms: subResult.uniforms,
      metadata: { warnings: [], errors: [], executionOrder, finalOutputNodeId },
      paramLayout: {},
      resources: [],
    };
  }

  const slotMax = Object.values(subResult.paramLayout).reduce((m, v) => Math.max(m, v), -1);
  let next = slotMax + 1;
  const paramSlots = {
    threshold: next++,
    intensity: next++,
    radius: next++,
    strength: next++,
    blades: next++,
    rotation: next++,
  };
  const paramLayout: ParamLayout = {
    ...subResult.paramLayout,
    [`${bokehNodeId}.bokehThreshold`]: paramSlots.threshold,
    [`${bokehNodeId}.bokehIntensity`]: paramSlots.intensity,
    [`${bokehNodeId}.bokehRadius`]: paramSlots.radius,
    [`${bokehNodeId}.bokehStrength`]: paramSlots.strength,
    [`${bokehNodeId}.bokehBlades`]: paramSlots.blades,
    [`${bokehNodeId}.bokehRotation`]: paramSlots.rotation,
  };

  /** `RENDER_ATTACHMENT | TEXTURE_BINDING | COPY_SRC | COPY_DST`. */
  const intermediateUsage = (16 | 4 | 2 | 8) as WebGpuTextureDesc['usage'];

  const webgpuPassPlan: WebGpuPassPlan = {
    kind: 'pass.bokeh.v1',
    nodeId: bokehNodeId,
    inputWgsl: subResult.code,
    thresholdWgsl: BOKEH_THRESHOLD_WGSL,
    blurWgsl: BOKEH_BLUR_WGSL,
    combineWgsl: BOKEH_COMBINE_WGSL,
    intermediateTexture: {
      size: { kind: 'canvas' },
      format: 'rgba8unorm',
      usage: intermediateUsage,
      label: 'bokeh.intermediate',
    },
    paramSlots,
  } as WebGpuPassPlan;

  return {
    backend: 'webgpu',
    supported: true,
    code: subResult.code,
    shaderCode: '',
    uniforms: subResult.uniforms,
    metadata: {
      warnings: subResult.metadata.warnings,
      errors: [],
      executionOrder,
      finalOutputNodeId,
      previewDependencies: subResult.metadata.previewDependencies,
    },
    paramLayout,
    resources: [],
    webgpuPassPlan,
  };
}

function laneCount(t: WgslType): 1 | 2 | 3 | 4 {
  switch (t) {
    case 'f32':
      return 1;
    case 'vec2<f32>':
      return 2;
    case 'vec3<f32>':
      return 3;
    case 'vec4<f32>':
      return 4;
  }
}

function promoteType(a: WgslType, b: WgslType): WgslType {
  const la = laneCount(a);
  const lb = laneCount(b);
  const l = Math.max(la, lb);
  if (l === 4) return 'vec4<f32>';
  if (l === 3) return 'vec3<f32>';
  if (l === 2) return 'vec2<f32>';
  return 'f32';
}

function asF32(expr: Expr): Expr | null {
  return expr.type === 'f32' ? expr : null;
}

function asVec4(expr: Expr): Expr | null {
  return expr.type === 'vec4<f32>' ? expr : null;
}

function asVec3(expr: Expr): Expr | null {
  return expr.type === 'vec3<f32>' ? expr : null;
}

/**
 * Typed zero `Expr` for an input port type. Mirrors GLSL `getInputDefaultValue`
 * so unconnected, fallback-less inputs compile to a deterministic zero (matching
 * `MainCodeGeneratorNodeCode`'s behavior) instead of bailing the WGSL emit.
 *
 * `'int' | 'bool' | 'any'` are not first-class WGSL types in this MVP; they map
 * to scalar `0.0` because the only callers using them coerce or splat afterwards.
 */
function defaultExprForPortType(type: PortType): Expr {
  switch (type) {
    case 'vec2': return { type: 'vec2<f32>', code: 'vec2<f32>(0.0)' };
    case 'vec3': return { type: 'vec3<f32>', code: 'vec3<f32>(0.0)' };
    case 'vec4': return { type: 'vec4<f32>', code: 'vec4<f32>(0.0)' };
    case 'float':
    case 'int':
    case 'bool':
    case 'any':
    default:
      return { type: 'f32', code: '0.0' };
  }
}

function coerceToType(expr: Expr, target: WgslType): Expr | null {
  if (expr.type === target) return expr;

  // Allow scalar splat to vector.
  if (expr.type === 'f32') {
    if (target === 'vec2<f32>') return { type: target, code: `vec2<f32>(${expr.code})` };
    if (target === 'vec3<f32>') return { type: target, code: `vec3<f32>(${expr.code})` };
    if (target === 'vec4<f32>') return { type: target, code: `vec4<f32>(${expr.code})` };
  }

  // Allow common GLSL-style vector widening/narrowing.
  if (expr.type === 'vec2<f32>') {
    if (target === 'vec3<f32>') return { type: target, code: `vec3<f32>(${expr.code}, 0.0)` };
    if (target === 'vec4<f32>') return { type: target, code: `vec4<f32>(${expr.code}, 0.0, 1.0)` };
  }
  if (expr.type === 'vec3<f32>') {
    if (target === 'vec2<f32>') return { type: target, code: `vec2<f32>(${expr.code}.xy)` };
    if (target === 'vec4<f32>') return { type: target, code: `vec4<f32>(${expr.code}, 1.0)` };
  }
  if (expr.type === 'vec4<f32>') {
    if (target === 'vec2<f32>') return { type: target, code: `vec2<f32>(${expr.code}.xy)` };
    if (target === 'vec3<f32>') return { type: target, code: `vec3<f32>(${expr.code}.xyz)` };
  }

  return null;
}

function computeParamLayout(uniforms: UniformMetadata[]): ParamLayout {
  const keys = uniforms.map((u) => `${u.nodeId}.${u.paramName}`);
  keys.sort();
  const out: Record<string, number> = {};
  for (let i = 0; i < keys.length; i++) out[keys[i] as string] = i;
  return out;
}

function computeUpstreamReachableNodeIds(graph: NodeGraph, outputNodeId: string): Set<string> {
  const upstreamByTarget = new Map<string, string[]>();
  for (const c of graph.connections) {
    const list = upstreamByTarget.get(c.targetNodeId);
    if (list) list.push(c.sourceNodeId);
    else upstreamByTarget.set(c.targetNodeId, [c.sourceNodeId]);
  }

  const reachable = new Set<string>();
  const stack: string[] = [outputNodeId];
  while (stack.length > 0) {
    const id = stack.pop() as string;
    if (reachable.has(id)) continue;
    reachable.add(id);
    const ups = upstreamByTarget.get(id);
    if (!ups) continue;
    for (const srcId of ups) stack.push(srcId);
  }
  return reachable;
}

function paramSlotExpr(layout: ParamLayout, nodeId: string, paramName: string, lane: 0 | 1 | 2 | 3): string {
  const idx = layout[`${nodeId}.${paramName}`];
  if (idx == null) return '0.0';
  const sw = ['x', 'y', 'z', 'w'][lane];
  return `params[${idx}].${sw}`;
}

function lookupInputConnection(graph: NodeGraph, targetNodeId: string, targetPort: string): { sourceNodeId: string; sourcePort: string } | null {
  for (const c of graph.connections) {
    if (c.targetNodeId === targetNodeId && c.targetPort === targetPort) {
      return { sourceNodeId: c.sourceNodeId, sourcePort: c.sourcePort };
    }
  }
  return null;
}

function sanitizeWgslIdentifier(raw: string): string {
  const s = raw.replace(/[^a-zA-Z0-9_]/g, '_');
  if (s.length === 0) return '_id';
  return /^[0-9]/.test(s) ? `_${s}` : s;
}

/**
 * WebGPU MVP: `generic-raymarcher` supports a bounded set of sdf sources + optional `displacement-3d`.
 * An unwired `sdf` port (or bypassed Rule-B SDF that drops the edge) compiles to black / zero glow instead of falling back to WebGL.
 * An unwired `in` port uses the same typed-zero default as GLSL/WGSL `resolveInputVec2` (`vec2<f32>(0.0)`); do not hard-fail compile for missing `in`.
 */
function validateGenericRaymarcherWebGpuMvp(graph: NodeGraph, reachable: Set<string>): string[] {
  const reasons: string[] = [];
  for (const node of graph.nodes) {
    if (!reachable.has(node.id) || node.type !== 'generic-raymarcher') continue;

    const sdfConn = lookupInputConnection(graph, node.id, 'sdf');
    if (!sdfConn || sdfConn.sourcePort !== 'out') {
      continue;
    }
    const sdfNode = graph.nodes.find((n) => n.id === sdfConn.sourceNodeId);
    if (!sdfNode) {
      continue;
    }
    if (!GENERIC_RAYMARCHER_WEBGPU_MVP_SDF_TYPES.has(sdfNode.type)) {
      reasons.push(
        `generic-raymarcher (WebGPU MVP): sdf source must be one of (${GENERIC_RAYMARCHER_WEBGPU_MVP_SDF_TYPES.size} allowed): ${genericRaymarcherWebGpuMvpSdfAllowedListSentence()} — got '${sdfNode.type}'`
      );
    }

    const dispRay = lookupInputConnection(graph, node.id, 'displacement');
    if (dispRay) {
      const dNodeRay = graph.nodes.find((n) => n.id === dispRay.sourceNodeId);
      if (dispRay.sourcePort !== 'out' || !dNodeRay || dNodeRay.type !== 'displacement-3d') {
        reasons.push(
          'generic-raymarcher (WebGPU MVP): displacement port supports `displacement-3d.out` wired to displacement only (matches GLSL `getGenericRaymarcherReplacements` sampling at marching `pos`)'
        );
      }
    }
  }
  return reasons.sort((a, b) => a.localeCompare(b));
}

/** Shared WGSL kernel for Mandelbulb distance (matches mandelbulb-sdf.glsl semantics). */
const MANDELBULB_SDF_DISTANCE_FN = `
fn mandelbulbSdf_distance(
  c: vec3<f32>,
  powerIn: f32,
  iterationsIn: i32,
  bailout: f32,
  de_fudge: f32,
  hybrid_mix: f32,
) -> f32 {
  var z = c;
  var dr = 1.0;
  var r_len = 0.0;
  let bailSq = bailout * bailout;
  let iterMax = clamp(iterationsIn, i32(1), i32(32));
  for (var ii: i32 = 0; ii < 32; ii = ii + 1) {
    if (ii >= iterMax) { break; }
    r_len = length(z);
    if (r_len * r_len > bailSq) { break; }

    let rSafe = max(r_len, 1e-6);
    let invR = 1.0 / rSafe;
    var theta = acos(clamp(z.z * invR, -1.0, 1.0));
    var phi = atan2(z.y, z.x + 1e-7);
    let powUse = clamp(powerIn, 2.0, 24.0);
    let rp = pow(rSafe, powUse - 1.0);
    dr = dr * powUse * rp + 1.0;
    let zr = min(rp * rSafe, 1e6);
    theta = theta * powUse;
    phi = phi * powUse;
    let st = sin(theta);
    z = zr * vec3<f32>(st * cos(phi), st * sin(phi), cos(theta));
    z = z + c;
  }

  r_len = length(z);
  let rFin = max(r_len, 1e-6);
  dr = max(dr, 1e-6);
  var mi = log(rFin);
  mi = clamp(mi, -40.0, 40.0);
  let raw = 0.5 * mi * rFin / dr;
  var dist = max(de_fudge * raw, 1e-5);
  dist = clamp(dist, 1e-5, 200.0);
  let outer = length(c) - clamp(bailout * 0.72, 0.5, 6.0);
  let t = clamp(hybrid_mix, 0.0, 1.0);
  return mix(dist, outer, t);
}

`;

/** Metaballs field + gradient (`metaballs.ts` parity); sdf uses (F - threshold) / |∇F|. */
const METABALLS_WGSL_HELPERS = `
fn metaballsWgsl_center_i(i: i32, center: vec3<f32>, orbit_radius: f32, t_anim: f32, blob_count: i32) -> vec3<f32> {
  let n = max(f32(blob_count), 1.0);
  let phase = f32(i) * 6.28318530718 / n;
  let a = t_anim + phase;
  return center + orbit_radius * vec3<f32>(cos(a), sin(a), 0.0);
}

fn metaballsWgsl_field(p: vec3<f32>, center: vec3<f32>, orbit_radius: f32, blob_r2: f32, t_anim: f32, blob_count: i32) -> f32 {
  var sum = 0.0;
  for (var ii: i32 = 0; ii < 6; ii++) {
    if (ii >= blob_count) { break; }
    let c_i = metaballsWgsl_center_i(ii, center, orbit_radius, t_anim, blob_count);
    let di = p - c_i;
    let d2 = dot(di, di) + 1e-6;
    sum = sum + blob_r2 / d2;
  }
  return sum;
}

fn metaballsWgsl_gradient(p: vec3<f32>, center: vec3<f32>, orbit_radius: f32, blob_r2: f32, t_anim: f32, blob_count: i32) -> vec3<f32> {
  var g = vec3<f32>(0.0, 0.0, 0.0);
  for (var ii: i32 = 0; ii < 6; ii++) {
    if (ii >= blob_count) { break; }
    let c_i = metaballsWgsl_center_i(ii, center, orbit_radius, t_anim, blob_count);
    let di = p - c_i;
    let d2 = dot(di, di) + 1e-6;
    g = g - (2.0 * blob_r2 * di / (d2 * d2));
  }
  return g;
}

fn metaballsWgsl_implicit_sdf(
  p: vec3<f32>,
  center: vec3<f32>,
  orbit_radius: f32,
  blob_radius: f32,
  threshold_val: f32,
  t_anim: f32,
  blob_count: i32,
) -> f32 {
  let blob_r2 = blob_radius * blob_radius;
  let fv = metaballsWgsl_field(p, center, orbit_radius, blob_r2, t_anim, blob_count);
  let gn = metaballsWgsl_gradient(p, center, orbit_radius, blob_r2, t_anim, blob_count);
  let gl = length(gn) + 1e-5;
  return (fv - threshold_val) / gl;
}

fn metaballsWgsl_standalone_raymarch(
  uv_in: vec2<f32>,
  center: vec3<f32>,
  orbit_radius: f32,
  blob_radius: f32,
  threshold_val: f32,
  t_anim_coef: f32,
  blob_count_raw: f32,
  steps_raw: f32,
  glow_intensity: f32,
) -> f32 {
  let ro = vec3<f32>(0.0, 0.0, 3.0);
  let rd_raw = vec3<f32>(uv_in, -1.0);
  let rd = select(vec3<f32>(0.0, 0.0, -1.0), normalize(rd_raw), length(rd_raw) > 0.001);
  let blob_count = clamp(i32(floor(blob_count_raw + 0.5)), 2, 6);
  let steps_cap = clamp(i32(floor(steps_raw + 0.5)), 16, 128);

  var ray_t = 0.0;
  var hit = 0.0;
  var glow = 0.0;

  for (var ii: i32 = 0; ii < 128; ii++) {
    if (ii >= steps_cap) { break; }

    let p_m = ro + rd * ray_t;
    let blob_r2 = blob_radius * blob_radius;
    let fv = metaballsWgsl_field(p_m, center, orbit_radius, blob_r2, t_anim_coef, blob_count);

    if (fv >= threshold_val) {
      hit = 1.0 - ray_t * 0.08;
      glow = glow + glow_intensity / (1.0 + (fv - threshold_val) * 2.0);
      break;
    }

    let gr = metaballsWgsl_gradient(p_m, center, orbit_radius, blob_r2, t_anim_coef, blob_count);
    let grad_len = length(gr) + 1e-5;
    var step_size = (threshold_val - fv) / grad_len;
    step_size = clamp(step_size, 0.002, 0.5);
    ray_t = ray_t + step_size;

    glow = glow + glow_intensity * step_size / (1.0 + (threshold_val - fv) * 2.0);

    if (ray_t > 50.0) { break; }
  }

  return hit + clamp(glow * 0.15, 0.0, 1.0);
}
`;

/**
 * Sphere-raymarch "distance" for `generic-raymarcher.sdf`: same spatial terms as standalone's inner loop when
 * the prior marching step uses d=1.0 (standalone initializes d to 1.0). Not a true global SDF; bounded march adapter.
 */
const SPHERE_RAYMARCH_IMPLICIT_DISTANCE_WGSL = `
fn sphereRaymarch_implicit_distance_for_grm(
  pos: vec3<f32>,
  time: f32,
  sphereRadius: f32,
  freq: vec3<f32>,
  amplitude: f32,
  radialStrength: f32,
  harmonicAmp: f32,
  complexityIn: f32,
  distContrib: f32,
  vectorFieldSpeed: f32,
  animationSpeed: f32,
) -> f32 {
  let vectorFieldTime = time * animationSpeed * vectorFieldSpeed;
  var p = pos;
  p.z = p.z + 0.5;
  let dPrev = 1.0;
  var a = normalize(cos(freq + vectorFieldTime - dPrev * radialStrength));
  a = a * dot(a, p) - cross(a, p) * amplitude;

  let complexity = clamp(complexityIn, 1.0, 15.0);
  for (var jj: i32 = 1; jj < 15; jj = jj + 1) {
    if (f32(jj) >= complexity) { break; }
    a = a + (sin(a * f32(jj) + vectorFieldTime).yzx / f32(jj)) * harmonicAmp;
  }

  let pLen = length(p);
  return 0.05 * abs(pLen - sphereRadius) + distContrib * abs(a.y);
}
`;

/** Two-stage raymarch (outer → refract → inner) WGSL parity with `glass-shell.ts`. */
const GLASS_SHELL_WGSL = `
fn glass_shell_gs_ct_specular(n_in: vec3<f32>, v_in: vec3<f32>, l_in: vec3<f32>, roughness_in: f32, f0_in: f32) -> f32 {
  let r = clamp(roughness_in, 0.001, 1.0);
  let f0v = clamp(f0_in, 0.0, 1.0);
  let n = normalize(n_in);
  let v = normalize(v_in);
  let l = normalize(l_in);
  let ndotl = max(dot(n, l), 1e-6);
  if (ndotl <= 0.0) {
    return 0.0;
  }
  let ndotv = max(dot(n, v), 1e-6);
  let h = normalize(v + l);
  let ndoth = max(dot(n, h), 0.0);
  let vdoth = max(dot(v, h), 0.0);
  let a = r * r;
  let a2 = a * a;
  let ndoth2 = ndoth * ndoth;
  var denom = ndoth2 * (a2 - 1.0) + 1.0;
  denom = max(denom * denom * 3.14159265, 1e-7);
  let D = a2 / denom;
  let k = (r + 1.0) * (r + 1.0) * 0.125;
  let g1v = ndotv / (ndotv * (1.0 - k) + k);
  let g1l = ndotl / (ndotl * (1.0 - k) + k);
  let G = g1v * g1l;
  let F = f0v + (1.0 - f0v) * pow(1.0 - vdoth, 5.0);
  let spec = (D * G * F) / (4.0 * ndotv * ndotl);
  return clamp(spec, 0.0, 10.0);
}

fn glass_shell_gs_oklch_to_rgb(oklch_in: vec3<f32>) -> vec3<f32> {
  let l_ok = oklch_in.x;
  let chr = oklch_in.y;
  let h_rad = oklch_in.z * 3.14159265359 / 180.0;
  let aa = chr * cos(h_rad);
  let bb = chr * sin(h_rad);
  let l_ = l_ok + 0.3963377774 * aa + 0.2158037573 * bb;
  let m_ = l_ok - 0.1055613458 * aa - 0.0638541728 * bb;
  let s_ = l_ok - 0.0894841775 * aa - 1.2914855480 * bb;
  let l3 = l_ * l_ * l_;
  let m3 = m_ * m_ * m_;
  let s3 = s_ * s_ * s_;
  let r_lin = 4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3;
  let g_lin = -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3;
  let b_lin = -0.0041960863 * l3 - 0.7034186147 * m3 + 1.7076147010 * s3;
  return clamp(vec3<f32>(r_lin, g_lin, b_lin), vec3<f32>(0.0), vec3<f32>(1.0));
}

fn glass_shell_gs_sd_sphere(p: vec3<f32>, r_raw: f32) -> f32 {
  let r = max(r_raw, 0.001);
  return length(p) - r;
}

fn glass_shell_gs_sd_box(p: vec3<f32>, sz: vec3<f32>) -> f32 {
  let q = abs(p) - sz;
  return length(max(q, vec3<f32>(0.0))) + min(max(q.x, max(q.y, q.z)), 0.0);
}

fn glass_shell_gs_sd_icosahedron(p_in: vec3<f32>, s_in: f32) -> f32 {
  let ICO_Q = 2.61803398875;
  let n1_len_rcp = inverseSqrt(ICO_Q * ICO_Q + 1.0);
  let n1 = vec3<f32>(ICO_Q * n1_len_rcp, n1_len_rcp, 0.0);
  let n2 = vec3<f32>(0.57735026919, 0.57735026919, 0.57735026919);
  let rr = max(s_in, 0.01);
  let rr3 = vec3<f32>(rr, rr, rr);
  let p = abs(p_in / rr3);
  let da = dot(p, n1);
  let db = dot(p, vec3<f32>(n1.z, n1.x, n1.y));
  let dc = dot(p, vec3<f32>(n1.y, n1.z, n1.x));
  let dm = dot(p, n2) - n1.x;
  return max(max(max(da, db), dc) - n1.x, dm) * rr;
}

fn glass_shell_gs_smin(a: f32, b: f32, k: f32) -> f32 {
  let kk = max(k, 0.01);
  let h = max(kk - abs(a - b), 0.0) / kk;
  return min(a, b) - h * h * kk * 0.25;
}

fn glass_shell_gs_outer_sdf(p: vec3<f32>, outer_shape: i32, outer_sz_raw: f32, oc: vec3<f32>) -> f32 {
  let q = p - oc;
  let s = max(outer_sz_raw, 0.01);
  if (outer_shape == 0) {
    return glass_shell_gs_sd_sphere(q, s);
  }
  if (outer_shape == 1) {
    return glass_shell_gs_sd_box(q, vec3<f32>(s, s, s));
  }
  return glass_shell_gs_sd_icosahedron(q, s);
}

fn glass_shell_gs_inner_sdf(
  p: vec3<f32>,
  inner_shape: i32,
  inner_sz_raw: f32,
  ic: vec3<f32>,
  inner_blend_k_raw: f32,
) -> f32 {
  let q = p - ic;
  let sz = max(inner_sz_raw, 0.01);
  let kb = max(inner_blend_k_raw, 0.01);
  if (inner_shape == 0) {
    return glass_shell_gs_sd_sphere(q, sz);
  }
  if (inner_shape == 1) {
    return glass_shell_gs_sd_box(q, vec3<f32>(sz, sz, sz));
  }
  let d_s = glass_shell_gs_sd_sphere(q, sz);
  let d_b = glass_shell_gs_sd_box(q, vec3<f32>(sz, sz, sz));
  return glass_shell_gs_smin(d_s, d_b, kb);
}

fn glass_shell_gs_outer_normal(p: vec3<f32>, outer_shape: i32, outer_sz: f32, oc: vec3<f32>) -> vec3<f32> {
  let eps = 0.001;
  let d = glass_shell_gs_outer_sdf(p, outer_shape, outer_sz, oc);
  let dx = glass_shell_gs_outer_sdf(p + vec3<f32>(eps, 0.0, 0.0), outer_shape, outer_sz, oc) - d;
  let dy = glass_shell_gs_outer_sdf(p + vec3<f32>(0.0, eps, 0.0), outer_shape, outer_sz, oc) - d;
  let dz = glass_shell_gs_outer_sdf(p + vec3<f32>(0.0, 0.0, eps), outer_shape, outer_sz, oc) - d;
  return normalize(vec3<f32>(dx, dy, dz));
}

fn glass_shell_gs_inner_normal(
  p: vec3<f32>,
  inner_shape: i32,
  inner_sz: f32,
  ic: vec3<f32>,
  inner_blend_k: f32,
) -> vec3<f32> {
  let eps = 0.001;
  let d = glass_shell_gs_inner_sdf(p, inner_shape, inner_sz, ic, inner_blend_k);
  let dx = glass_shell_gs_inner_sdf(p + vec3<f32>(eps, 0.0, 0.0), inner_shape, inner_sz, ic, inner_blend_k) - d;
  let dy = glass_shell_gs_inner_sdf(p + vec3<f32>(0.0, eps, 0.0), inner_shape, inner_sz, ic, inner_blend_k) - d;
  let dz = glass_shell_gs_inner_sdf(p + vec3<f32>(0.0, 0.0, eps), inner_shape, inner_sz, ic, inner_blend_k) - d;
  return normalize(vec3<f32>(dx, dy, dz));
}

fn glass_shell_gs_raymarch_outer(
  ro: vec3<f32>,
  rd: vec3<f32>,
  steps_cap: i32,
  outer_shape: i32,
  outer_sz: f32,
  oc: vec3<f32>,
) -> f32 {
  var ray_t = 0.0;
  for (var ii: i32 = 0; ii < 128; ii++) {
    if (ii >= steps_cap) {
      break;
    }
    let pp = ro + rd * ray_t;
    let d = glass_shell_gs_outer_sdf(pp, outer_shape, outer_sz, oc);
    if (d < 0.0008) {
      return ray_t;
    }
    ray_t = ray_t + d;
    if (ray_t > 100.0) {
      break;
    }
  }
  return -1.0;
}

fn glass_shell_gs_raymarch_inner(
  ro: vec3<f32>,
  rd: vec3<f32>,
  steps_cap: i32,
  inner_shape: i32,
  inner_sz: f32,
  ic: vec3<f32>,
  inner_blend_k: f32,
) -> f32 {
  var ray_t = 0.0;
  for (var jj: i32 = 0; jj < 128; jj++) {
    if (jj >= steps_cap) {
      break;
    }
    let pp = ro + rd * ray_t;
    let d = glass_shell_gs_inner_sdf(pp, inner_shape, inner_sz, ic, inner_blend_k);
    if (d < 0.0008) {
      return ray_t;
    }
    ray_t = ray_t + d;
    if (ray_t > 100.0) {
      break;
    }
  }
  return -1.0;
}

fn glass_shell_standalone_pixel(
  _uv_unused: vec2<f32>,
  ro: vec3<f32>,
  rd_in: vec3<f32>,
  outer_shape_raw: i32,
  inner_shape_raw: i32,
  ior_raw: f32,
  outer_sz_raw: f32,
  oc: vec3<f32>,
  inner_sz_raw: f32,
  ic: vec3<f32>,
  inner_blend_k_raw: f32,
  outer_steps_raw: f32,
  inner_steps_raw: f32,
  light_dir: vec3<f32>,
  light_intensity: f32,
  ambient: f32,
  inner_albedo: vec3<f32>,
  bg_color: vec3<f32>,
  spec_ct_raw: i32,
  spec_roughness: f32,
  spec_f0: f32,
  outer_spec_str: f32,
) -> vec4<f32> {
  let rd = select(vec3<f32>(0.0, 0.0, -1.0), normalize(rd_in), length(rd_in) > 0.001);
  let outer_shape = clamp(outer_shape_raw, i32(0), i32(2));
  let inner_shape = clamp(inner_shape_raw, i32(0), i32(2));
  let ior = max(ior_raw, 1.01);
  let eta = 1.0 / ior;
  let outer_steps_cap = clamp(outer_steps_raw, 10.0, 128.0);
  let outer_steps_i = clamp(i32(floor(outer_steps_cap + 0.5)), 10, 128);
  let inner_steps_cap = clamp(inner_steps_raw, 10.0, 128.0);
  let inner_steps_i = clamp(i32(floor(inner_steps_cap + 0.5)), 10, 128);
  let spec_ct = clamp(spec_ct_raw, i32(0), i32(1));

  let t_outer = glass_shell_gs_raymarch_outer(ro, rd, outer_steps_i, outer_shape, outer_sz_raw, oc);
  if (t_outer < 0.0) {
    return vec4<f32>(bg_color, 0.0);
  }
  let hit_p = ro + rd * t_outer;
  let outer_n = glass_shell_gs_outer_normal(hit_p, outer_shape, outer_sz_raw, oc);
  let refracted = refract(rd, outer_n, eta);
  var refr_dir = refracted;
  if (length(refr_dir) < 0.01) {
    refr_dir = reflect(rd, outer_n);
  }
  let ro_inner = hit_p + outer_n * 0.002;
  let t_inner = glass_shell_gs_raymarch_inner(
    ro_inner,
    refr_dir,
    inner_steps_i,
    inner_shape,
    inner_sz_raw,
    ic,
    inner_blend_k_raw,
  );

  var inner_color: vec3<f32>;
  if (t_inner >= 0.0) {
    let inner_p = ro_inner + refr_dir * t_inner;
    let inner_nrm = glass_shell_gs_inner_normal(inner_p, inner_shape, inner_sz_raw, ic, inner_blend_k_raw);
    let v_in = -refr_dir;
    let lnorm = normalize(light_dir);
    let diff_c = max(dot(inner_nrm, lnorm), 0.0) * light_intensity;
    var lighting = ambient + diff_c;
    if (spec_ct != 0) {
      lighting =
        lighting +
        glass_shell_gs_ct_specular(inner_nrm, v_in, lnorm, spec_roughness, spec_f0) *
          light_intensity;
    }
    inner_color = inner_albedo * clamp(lighting, 0.0, 2.0);
  } else {
    inner_color = bg_color;
  }

  let v_outer = -rd;
  let l_outer = normalize(light_dir);
  var outer_spec: f32 = 0.0;
  if (spec_ct != 0) {
    outer_spec =
      glass_shell_gs_ct_specular(outer_n, v_outer, l_outer, spec_roughness, spec_f0) *
      outer_spec_str *
      light_intensity;
  } else {
    let h_ph = normalize(v_outer + l_outer);
    outer_spec =
      pow(max(dot(outer_n, h_ph), 0.0), 32.0) *
      outer_spec_str *
      light_intensity;
  }
  let final_rgb = inner_color + vec3<f32>(outer_spec, outer_spec, outer_spec);
  return vec4<f32>(clamp(final_rgb, vec3<f32>(0.0), vec3<f32>(1.0)), 1.0);
}
`;

/** Scene SDF (`box-torus-sdf.ts` primitives) + standalone raymarch/shading WGSL parity. */
const BOX_TORUS_SDF_WGSL = `
struct BoxTorusSdfSceneParams {
  prim: i32,
  center: vec3<f32>,
  rx: f32,
  ry: f32,
  rz: f32,
  sx: f32,
  sy: f32,
  sz: f32,
}

fn btSdBox(p: vec3<f32>, b: vec3<f32>) -> f32 {
  let q = abs(p) - b;
  return length(max(q, vec3<f32>(0.0))) + min(max(max(q.x, q.y), q.z), 0.0);
}

fn btSdTorus(p: vec3<f32>, t: vec2<f32>) -> f32 {
  let q = vec2<f32>(length(vec2<f32>(p.x, p.z)) - t.x, p.y);
  return length(q) - t.y;
}

fn btSdCapsule(p: vec3<f32>, a: vec3<f32>, b: vec3<f32>, r: f32) -> f32 {
  let pa = p - a;
  let ba = b - a;
  let denom = dot(ba, ba);
  let h = clamp(dot(pa, ba) / max(denom, 1e-8), 0.0, 1.0);
  return length(pa - ba * h) - r;
}

fn btSdCappedCylinder(p: vec3<f32>, r: f32, h: f32) -> f32 {
  let d = abs(vec2<f32>(length(vec2<f32>(p.x, p.z)), p.y)) - vec2<f32>(r, h);
  return min(max(d.x, d.y), 0.0) + length(max(d, vec2<f32>(0.0)));
}

fn btSdCappedCone(p: vec3<f32>, h: f32, r1: f32, r2: f32) -> f32 {
  let q = vec2<f32>(length(vec2<f32>(p.x, p.z)), p.y);
  let k1 = vec2<f32>(r2, h);
  let k2 = vec2<f32>(r2 - r1, 2.0 * h);
  let qy_lt0 = q.y < 0.0;
  let minqx = select(r2, r1, qy_lt0);
  let ca = vec2<f32>(q.x - min(q.x, minqx), abs(q.y) - h);
  let k2d = dot(k2, k2);
  let cb = q - k1 + k2 * clamp(dot(k1 - q, k2) / max(k2d, 1e-8), 0.0, 1.0);
  let inNeg = cb.x < 0.0 && ca.y < 0.0;
  let s = select(1.0, -1.0, inNeg);
  return s * sqrt(min(dot(ca, ca), dot(cb, cb)));
}

fn btSdRoundCone(p: vec3<f32>, r1: f32, r2: f32, h: f32) -> f32 {
  let b = (r1 - r2) / max(h, 1e-6);
  let a = sqrt(max(0.0, 1.0 - b * b));
  let q = vec2<f32>(length(vec2<f32>(p.x, p.z)), p.y);
  let k = dot(q, vec2<f32>(-b, a));
  if (k < 0.0) {
    return length(q) - r1;
  }
  if (k > a * h) {
    return length(q - vec2<f32>(0.0, h)) - r2;
  }
  return dot(q, vec2<f32>(a, b)) - r1;
}

fn btSdOctahedron(p_in: vec3<f32>, s: f32) -> f32 {
  let p = abs(p_in);
  let m = p.x + p.y + p.z - s;
  var q = p;
  if (3.0 * p.x < m) {
    q = p;
  } else if (3.0 * p.y < m) {
    q = vec3<f32>(p.y, p.z, p.x);
  } else if (3.0 * p.z < m) {
    q = vec3<f32>(p.z, p.x, p.y);
  } else {
    return m * 0.57735027;
  }
  let k = clamp(0.5 * (q.z - q.y + s), 0.0, s);
  return length(vec3<f32>(q.x, q.y - s + k, q.z - k));
}

fn btSdIcosahedron(p_in: vec3<f32>, s_in: f32) -> f32 {
  let ICO_Q = 2.61803398875;
  let n1_len_rcp = inverseSqrt(ICO_Q * ICO_Q + 1.0);
  let n1 = vec3<f32>(ICO_Q * n1_len_rcp, n1_len_rcp, 0.0);
  let n2 = vec3<f32>(0.57735026919, 0.57735026919, 0.57735026919);
  let rr = max(s_in, 0.01);
  let rr3 = vec3<f32>(rr, rr, rr);
  let p = abs(p_in / rr3);
  let da = dot(p, n1);
  let db = dot(p, vec3<f32>(n1.z, n1.x, n1.y));
  let dc = dot(p, vec3<f32>(n1.y, n1.z, n1.x));
  let dm = dot(p, n2) - n1.x;
  return max(max(max(da, db), dc) - n1.x, dm) * rr;
}

fn btRotX(p: vec3<f32>, ang: f32) -> vec3<f32> {
  let c = cos(ang);
  let s = sin(ang);
  return vec3<f32>(p.x, p.y * c - p.z * s, p.y * s + p.z * c);
}

fn btRotY(p: vec3<f32>, ang: f32) -> vec3<f32> {
  let c = cos(ang);
  let s = sin(ang);
  return vec3<f32>(p.x * c + p.z * s, p.y, -p.x * s + p.z * c);
}

fn btRotZ(p: vec3<f32>, ang: f32) -> vec3<f32> {
  let c = cos(ang);
  let s = sin(ang);
  return vec3<f32>(p.x * c - p.y * s, p.x * s + p.y * c, p.z);
}

fn boxTorusSceneSdf_distance(p: vec3<f32>, sc: BoxTorusSdfSceneParams) -> f32 {
  let prim = clamp(sc.prim, i32(0), i32(7));
  var tp = p - sc.center;
  tp = btRotX(tp, sc.rx);
  tp = btRotY(tp, sc.ry);
  tp = btRotZ(tp, sc.rz);
  var d: f32 = 1000.0;
  if (prim == 0) {
    d = btSdBox(tp, vec3<f32>(sc.sx, sc.sy, sc.sz));
  } else if (prim == 1) {
    d = btSdTorus(tp, vec2<f32>(sc.sx, sc.sy));
  } else if (prim == 2) {
    let a = vec3<f32>(0.0, -sc.sy, 0.0);
    let bv = vec3<f32>(0.0, sc.sy, 0.0);
    d = btSdCapsule(tp, a, bv, sc.sx);
  } else if (prim == 3) {
    d = btSdCappedCylinder(tp, sc.sx, sc.sy);
  } else if (prim == 4) {
    d = btSdCappedCone(tp, sc.sy, sc.sx, sc.sz);
  } else if (prim == 5) {
    d = btSdRoundCone(tp, sc.sx, sc.sz, sc.sy);
  } else if (prim == 6) {
    d = btSdOctahedron(tp, sc.sx);
  } else {
    d = btSdIcosahedron(tp, sc.sx);
  }
  return d;
}

fn btSdfNormal(p: vec3<f32>, sc: BoxTorusSdfSceneParams) -> vec3<f32> {
  let eps = 0.001;
  let d0 = boxTorusSceneSdf_distance(p, sc);
  let dx = boxTorusSceneSdf_distance(p + vec3<f32>(eps, 0.0, 0.0), sc) - d0;
  let dy = boxTorusSceneSdf_distance(p + vec3<f32>(0.0, eps, 0.0), sc) - d0;
  let dz = boxTorusSceneSdf_distance(p + vec3<f32>(0.0, 0.0, eps), sc) - d0;
  return normalize(vec3<f32>(dx, dy, dz));
}

fn btDirectionalDiffuse(nrm: vec3<f32>, light_dir: vec3<f32>) -> f32 {
  return max(dot(nrm, normalize(light_dir)), 0.0);
}

fn btPointAtten(hit_p: vec3<f32>, light_pos: vec3<f32>, _intensity_unused: f32, falloff: f32) -> f32 {
  let to_light = light_pos - hit_p;
  let dist = length(to_light);
  return 1.0 / max(1.0 + falloff * dist * dist, 0.001);
}

fn btCtSpecular(n_in: vec3<f32>, v_in: vec3<f32>, l_in: vec3<f32>, roughness_in: f32, f0_in: f32) -> f32 {
  let r = clamp(roughness_in, 0.001, 1.0);
  let f0v = clamp(f0_in, 0.0, 1.0);
  let n = normalize(n_in);
  let v = normalize(v_in);
  let l = normalize(l_in);
  let ndotl = max(dot(n, l), 1e-6);
  if (ndotl <= 0.0) {
    return 0.0;
  }
  let ndotv = max(dot(n, v), 1e-6);
  let h = normalize(v + l);
  let ndoth = max(dot(n, h), 0.0);
  let vdoth = max(dot(v, h), 0.0);
  let a = r * r;
  let a2 = a * a;
  let ndoth2 = ndoth * ndoth;
  var denom = ndoth2 * (a2 - 1.0) + 1.0;
  denom = max(denom * denom * 3.14159265, 1e-7);
  let D = a2 / denom;
  let k = (r + 1.0) * (r + 1.0) * 0.125;
  let g1v = ndotv / (ndotv * (1.0 - k) + k);
  let g1l = ndotl / (ndotl * (1.0 - k) + k);
  let G = g1v * g1l;
  let F = f0v + (1.0 - f0v) * pow(1.0 - vdoth, 5.0);
  let spec = (D * G * F) / (4.0 * ndotv * ndotl);
  return clamp(spec, 0.0, 10.0);
}

fn btRaymarchHitT(ro: vec3<f32>, rd: vec3<f32>, steps_i: i32, sc: BoxTorusSdfSceneParams) -> f32 {
  var ray_t = 0.0;
  for (var ii: i32 = 0; ii < 128; ii = ii + 1) {
    if (ii >= steps_i) {
      break;
    }
    let pp = ro + rd * ray_t;
    let d = boxTorusSceneSdf_distance(pp, sc);
    if (d < 0.001) {
      return ray_t;
    }
    ray_t = ray_t + d;
    if (ray_t > 100.0) {
      break;
    }
  }
  return -1.0;
}

fn btCalculateGlow(ro: vec3<f32>, rd: vec3<f32>, steps_i: i32, sc: BoxTorusSdfSceneParams) -> f32 {
  var ray_t = 0.0;
  var glow_acc = 0.0;
  let steps_f = max(f32(steps_i), 1.0);
  for (var ii: i32 = 0; ii < 64; ii = ii + 1) {
    if (ii >= steps_i) {
      break;
    }
    let pp = ro + rd * ray_t;
    let d = boxTorusSceneSdf_distance(pp, sc);
    if (d < 0.001) {
      break;
    }
    glow_acc = glow_acc + 1.0 / (1.0 + d * d * 10.0);
    ray_t = ray_t + max(d, 0.01);
    if (ray_t > 100.0) {
      break;
    }
  }
  return glow_acc / steps_f;
}

fn btSoftShadow(ro: vec3<f32>, rd: vec3<f32>, max_dist: f32, steps_i: i32, softness: f32, sc: BoxTorusSdfSceneParams) -> f32 {
  var ray_t = 0.0;
  var res = 1.0;
  for (var ii: i32 = 0; ii < 48; ii = ii + 1) {
    if (ii >= steps_i) {
      break;
    }
    let pp = ro + rd * ray_t;
    let d = boxTorusSceneSdf_distance(pp, sc);
    if (d < 0.001) {
      return 0.0;
    }
    res = min(res, softness * d / max(ray_t, 0.001));
    ray_t = ray_t + max(d, 0.01);
    if (ray_t >= max_dist) {
      break;
    }
  }
  return clamp(res, 0.0, 1.0);
}

fn boxTorusSdf_standalone_pixel(
  uv: vec2<f32>,
  ro: vec3<f32>,
  rd_in: vec3<f32>,
  sc: BoxTorusSdfSceneParams,
  steps_raw: f32,
  glow_intensity: f32,
  light_type_i: i32,
  light_dir_xyz: vec3<f32>,
  light_pos_xyz: vec3<f32>,
  light_intensity: f32,
  light_ambient: f32,
  light_falloff: f32,
  shadow_enable: i32,
  shadow_softness: f32,
  shadow_steps_raw: f32,
  spec_ct: i32,
  spec_roughness: f32,
  spec_f0: f32,
) -> f32 {
  let rd = select(vec3<f32>(0.0, 0.0, -1.0), normalize(rd_in), length(rd_in) > 0.001);
  let steps_rm = clamp(i32(floor(steps_raw + 0.5)), 10, 128);
  let shadow_steps_cap = clamp(i32(floor(shadow_steps_raw + 0.5)), 4, 48);

  let t_hit = btRaymarchHitT(ro, rd, steps_rm, sc);
  if (t_hit <= 0.0) {
    return 0.0;
  }
  let hit_p = ro + rd * t_hit;
  let nrm = btSdfNormal(hit_p, sc);
  let v_vec = -rd;

  var lighting = light_ambient;
  var l_dir = vec3<f32>(0.0, 0.0, 1.0);

  if (light_type_i == 0) {
    let lraw = light_dir_xyz;
    let llen = length(lraw);
    if (llen > 0.001) {
      l_dir = normalize(lraw);
      lighting = lighting + btDirectionalDiffuse(nrm, lraw) * light_intensity;
      if (shadow_enable != 0) {
        let shd = btSoftShadow(hit_p + nrm * 0.02, l_dir, 20.0, shadow_steps_cap, shadow_softness, sc);
        lighting = light_ambient + (lighting - light_ambient) * shd;
        if (spec_ct != 0) {
          lighting =
            lighting + btCtSpecular(nrm, v_vec, l_dir, spec_roughness, spec_f0) * light_intensity * shd;
        }
      } else if (spec_ct != 0) {
        lighting =
          lighting + btCtSpecular(nrm, v_vec, l_dir, spec_roughness, spec_f0) * light_intensity;
      }
    }
  } else {
    let lp = light_pos_xyz;
    let atten = btPointAtten(hit_p, lp, 1.0, light_falloff);
    l_dir = normalize(lp - hit_p);
    let diff = max(dot(nrm, l_dir), 0.0) * atten * light_intensity;
    var sh = 1.0;
    if (shadow_enable != 0) {
      let light_dist = length(lp - hit_p);
      sh = btSoftShadow(hit_p + nrm * 0.02, l_dir, light_dist, shadow_steps_cap, shadow_softness, sc);
    }
    lighting = lighting + diff * sh;
    if (spec_ct != 0) {
      lighting =
        lighting + btCtSpecular(nrm, v_vec, l_dir, spec_roughness, spec_f0) * atten * light_intensity * sh;
    }
  }

  let glow_field = btCalculateGlow(ro, rd, steps_rm, sc);
  let base_depth = (1.0 - t_hit * 0.1) + glow_field * glow_intensity;
  return base_depth * lighting;
}

`;

/** Infinite hex-prism lattice SDF (`repeated-hex-prism-sdf` node GLSL parity). */
const REPEATED_HEX_PRISM_SDF_WGSL = `
fn repeatedHexPrismSdf_distance(
  p: vec3<f32>,
  spacing: vec3<f32>,
  hex_radius: f32,
  half_height: f32,
) -> f32 {
  let s = max(spacing, vec3<f32>(1e-6));
  let mod_p = p - s * floor(p / s);
  let q = mod_p - 0.5 * s;
  let q2 = abs(q);
  let d2 = max((q2.x * 0.866025 + q2.y * 0.5), q2.y) - hex_radius;
  return max((q2.z - half_height), d2);
}
`;

/** Radial repeat / cylindrical-shell-style distance (`radial-repeat-sdf` node GLSL parity). */
const RADIAL_REPEAT_SDF_WGSL = `
fn radialRepeatSdf_distance(p: vec3<f32>, period_in: f32, half_period: f32) -> f32 {
  let r = length(p);
  let per = max(period_in, 1e-6);
  let m = r - per * floor(r / per);
  return abs(m - half_period);
}
`;

/** Julia slab SDF kernels (julia-slab-sdf.glsl parity). */
const JULIA_SLAB_SDF_WGSL_FN = `
fn julia_sl_cmul(a: vec2<f32>, b: vec2<f32>) -> vec2<f32> {
  return vec2<f32>(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x);
}

fn julia_sl_fractal_de(z0_in: vec2<f32>, c: vec2<f32>, escape_r: f32, max_iter_in: i32) -> f32 {
  var z = z0_in;
  var dz = vec2<f32>(1.0, 0.0);
  let r2lim = escape_r * escape_r;
  let iter_cap = clamp(max_iter_in, i32(4), i32(64));
  for (var i: i32 = 0; i < 64; i = i + 1) {
    if (i >= iter_cap) { break; }
    dz = 2.0 * julia_sl_cmul(z, dz);
    z = julia_sl_cmul(z, z) + c;
    let r2 = dot(z, z);
    if (r2 > r2lim) {
      let rl = sqrt(r2);
      let lz = log(max(rl, 1e-6));
      let ddz = length(dz);
      return 0.5 * lz * rl / max(ddz, 1e-8);
    }
  }
  return -0.05;
}

fn julia_sl_slab_sdf_dist(
  p: vec3<f32>,
  c: vec2<f32>,
  xy_scale: f32,
  escape_r: f32,
  max_iter_in: i32,
  slab_half: f32,
) -> f32 {
  let z0 = p.xy * xy_scale;
  let slab_d = abs(p.z) - slab_half;
  let jde = julia_sl_fractal_de(z0, c, escape_r, max_iter_in);
  return max(slab_d, jde);
}

`;

/** Shared quaternion → mat3 helpers (IFS / Mandelbox / Menger / Sierpinski GLSL parity). */
const SDF_AXIS_QUAT_MAT3_WGSL = `
fn sdf_axis_quat_to_mat3(q: vec4<f32>) -> mat3x3<f32> {
  let qSq = q * q;
  let xy2 = q.x * q.y * 2.0;
  let xz2 = q.x * q.z * 2.0;
  let yz2 = q.y * q.z * 2.0;
  let wx2 = q.w * q.x * 2.0;
  let wy2 = q.w * q.y * 2.0;
  let wz2 = q.w * q.z * 2.0;
  return mat3x3<f32>(
    vec3<f32>(qSq.w + qSq.x - qSq.y - qSq.z, xy2 + wz2, xz2 - wy2),
    vec3<f32>(xy2 - wz2, qSq.w - qSq.x + qSq.y - qSq.z, yz2 + wx2),
    vec3<f32>(xz2 + wy2, yz2 - wx2, qSq.w - qSq.x - qSq.y + qSq.z)
  );
}

fn sdf_axis_angle_to_mat3(axis: vec3<f32>, angle: f32) -> mat3x3<f32> {
  let axl = length(axis);
  let n = select(vec3<f32>(0.0, 1.0, 0.0), axis / axl, axl > 1e-5);
  let sna = sin(angle);
  let csa = cos(angle);
  return sdf_axis_quat_to_mat3(vec4<f32>(n * sna, csa));
}

`;

/** Mandelbox distance (matches mandelbox-sdf.glsl; first transform is row-vector parity via transpose). */
const MANDELBOX_SDF_EVAL_WGSL = `
fn mandelbx_box_fold(z: vec3<f32>, fl_in: f32) -> vec3<f32> {
  let fl = max(fl_in, 1e-4);
  return clamp(z, vec3<f32>(-fl, -fl, -fl), vec3<f32>(fl, fl, fl)) * 2.0 - z;
}

fn mandelbx_sphere_fold(z: vec3<f32>, min_r2: f32, fold_l2: f32) -> vec3<f32> {
  let r2 = dot(z, z);
  let k = min(max(fold_l2 / max(min_r2, r2), 1.0), 1e4);
  return z * k;
}

fn mandelbox_sdf_distance(
  p0: vec3<f32>,
  scale_mb: f32,
  folding_limit: f32,
  min_radius: f32,
  iterations_in: i32,
  offset_mb: vec3<f32>,
  rot_mb: mat3x3<f32>,
  de_fudge: f32,
) -> f32 {
  let rot_rt = transpose(rot_mb);
  var z = rot_rt * p0;
  let c = offset_mb;
  let fl = max(folding_limit, 1e-4);
  let min_r2 = min_radius * min_radius;
  let fold_l2 = fl * fl;
  var dm = 1.0;
  let sm = max(abs(scale_mb), 1e-4);
  let iter_cap = clamp(iterations_in, i32(1), i32(32));

  for (var i: i32 = 0; i < 32; i = i + 1) {
    if (i >= iter_cap) { break; }
    z = mandelbx_box_fold(z, fl);
    z = mandelbx_sphere_fold(z, min_r2, fold_l2);
    z = scale_mb * z + c;
    dm = dm * sm + 1.0;
  }
  return length(z) / max(dm, 1e-6) * de_fudge;
}

`;

/** KIFS kaleidoscopic IFS distance (`kifs-sdf.ts`: GLSL uses `p * rot`; column-WGSL parity = `transpose(rot) * p`). */
const KIFS_SDF_DISTANCE_WGSL = `
fn kifs_sdf_distance(
  p0: vec3<f32>,
  scale_in: f32,
  offset: vec3<f32>,
  rot: mat3x3<f32>,
  iterations_in: i32,
  radius: f32,
) -> f32 {
  let rot_rt = transpose(rot);
  var p = p0;
  var total_scale = 1.0;
  let sm = max(scale_in, 1e-6);
  let iter_cap = clamp(iterations_in, i32(1), i32(32));

  for (var i: i32 = 0; i < 32; i = i + 1) {
    if (i >= iter_cap) { break; }
    p = abs(p);
    p = p * sm;
    total_scale = total_scale * sm;
    p = p + offset;
    p = rot_rt * p;
  }

  return length(p) / max(total_scale, 1e-6) - radius;
}

`;

const MENGER_SPONGE_SDF_WGSL = `
fn mer_sg_mod2_components(vi: vec3<f32>) -> vec3<f32> {
  return vi - floor(vi / vec3<f32>(2.0, 2.0, 2.0)) * vec3<f32>(2.0, 2.0, 2.0);
}

fn mer_sg_sd_box(pi: vec3<f32>, b: vec3<f32>) -> f32 {
  let d_abs = abs(pi) - b;
  return min(max(max(d_abs.x, d_abs.y), d_abs.z), 0.0) + length(max(d_abs, vec3<f32>(0.0, 0.0, 0.0)));
}

fn mer_sponge_distance(
  z_in: vec3<f32>,
  max_iter_m: i32,
  wall_thick: f32,
  de_mul: f32,
) -> f32 {
  var z = z_in;
  var d_tot = mer_sg_sd_box(z, vec3<f32>(1.0, 1.0, 1.0));
  var s_acc = 1.0;
  let mi = clamp(max_iter_m, i32(1), i32(5));

  for (var i: i32 = 0; i < 5; i = i + 1) {
    if (i >= mi) { break; }
    let vv = mer_sg_mod2_components(z * s_acc + vec3<f32>(1.0, 1.0, 1.0));
    let aa = vv - vec3<f32>(1.0, 1.0, 1.0);
    s_acc *= 3.0;
    let rx = abs(1.0 - 3.0 * abs(aa.x));
    let ry = abs(1.0 - 3.0 * abs(aa.y));
    let rz = abs(1.0 - 3.0 * abs(aa.z));
    let rc_m = max(rx, max(ry, rz));
    let cut_m = max(rc_m - wall_thick, 1e-5);
    d_tot = min(d_tot, cut_m / s_acc);
    z = aa;
  }
  return clamp(d_tot * de_mul, 0.0, 50.0);
}

`;

/** Sierpinski tetra IFS sphere DE (matches sierpinski-tetra-sdf.glsl folds / loop). */
const SIERPINSKI_TETRA_SDF_WGSL = `
fn ster_fold_tetra(z_in: vec3<f32>) -> vec3<f32> {
  var z = z_in;
  if (z.x + z.y < 0.0) { z = vec3<f32>(-z.y, -z.x, z.z); }
  if (z.x + z.z < 0.0) { z = vec3<f32>(-z.z, z.y, -z.x); }
  if (z.y + z.z < 0.0) { z = vec3<f32>(z.x, -z.z, -z.y); }
  return z;
}

fn ster_tetra_distance(
  p_world: vec3<f32>,
  pre_rot_st: mat3x3<f32>,
  scl_ift: f32,
  ofs_ift: vec3<f32>,
  iters_ift: i32,
  core_r: f32,
  deb: f32,
) -> f32 {
  var zw = pre_rot_st * p_world;
  var w_accum = 1.0;
  let iter_cap_st = clamp(iters_ift, i32(1), i32(12));

  for (var i_st: i32 = 0; i_st < 12; i_st = i_st + 1) {
    if (i_st >= iter_cap_st) { break; }
    zw = ster_fold_tetra(zw);
    zw = zw * scl_ift - ofs_ift * (scl_ift - 1.0);
    w_accum *= scl_ift;
  }
  return (length(zw) / max(w_accum, 1e-6)) - core_r - deb;
}

`;

const DISPLACEMENT_3D_WGSL_HELPER = `
fn displacementHash11(n: f32) -> f32 {
  return fract(sin(n) * 43758.5453);
}

fn displacementVnoise(p: vec3<f32>) -> f32 {
  let ip = floor(p);
  let fp = fract(p);
  let basis = vec3<f32>(1.0, 57.0, 113.0);
  let n000 = displacementHash11(dot(ip + vec3<f32>(0.0, 0.0, 0.0), basis));
  let n100 = displacementHash11(dot(ip + vec3<f32>(1.0, 0.0, 0.0), basis));
  let n010 = displacementHash11(dot(ip + vec3<f32>(0.0, 1.0, 0.0), basis));
  let n110 = displacementHash11(dot(ip + vec3<f32>(1.0, 1.0, 0.0), basis));
  let n001 = displacementHash11(dot(ip + vec3<f32>(0.0, 0.0, 1.0), basis));
  let n101 = displacementHash11(dot(ip + vec3<f32>(1.0, 0.0, 1.0), basis));
  let n011 = displacementHash11(dot(ip + vec3<f32>(0.0, 1.0, 1.0), basis));
  let n111 = displacementHash11(dot(ip + vec3<f32>(1.0, 1.0, 1.0), basis));
  let w = fp * fp * fp * (fp * (fp * 6.0 - vec3<f32>(15.0)) + vec3<f32>(10.0));
  let x00 = mix(n000, n100, w.x);
  let x10 = mix(n010, n110, w.x);
  let x01 = mix(n001, n101, w.x);
  let x11 = mix(n011, n111, w.x);
  let y0 = mix(x00, x10, w.y);
  let y1 = mix(x01, x11, w.y);
  return mix(y0, y1, w.z) * 2.0 - 1.0;
}

fn displacementFbm1(pIn: vec3<f32>, octaves: i32, lacunarity: f32, gain: f32) -> f32 {
  var amp = 1.0;
  var freq = 1.0;
  var sum = 0.0;
  for (var i = 0; i < 10; i = i + 1) {
    if (i >= octaves) { break; }
    sum = sum + amp * displacementVnoise(pIn * freq);
    freq = freq * lacunarity;
    amp = amp * gain;
  }
  return sum;
}

fn displacementValueFbm3d(p: vec3<f32>, octaves: i32, lacunarity: f32, gain: f32) -> vec3<f32> {
  let nx = displacementFbm1(p + vec3<f32>(17.7, 31.3, 47.1), octaves, lacunarity, gain);
  let ny = displacementFbm1(p + vec3<f32>(53.7, 71.2, 89.4), octaves, lacunarity, gain);
  let nz = displacementFbm1(p + vec3<f32>(13.1, 27.7, 41.3), octaves, lacunarity, gain);
  return vec3<f32>(nx, ny, nz);
}
`;

/**
 * Uniform-name keys (`bandId.band`, `remap-x.out`, …) for panel audio signals wired into parameters
 * of reachable nodes. Ensures those slots stay in `usedUniforms` even when the duplicate virtual-node
 * mapping key is absent (must match {@link resolveAudioVirtualSlot} / virtual audio wiring rules).
 */
export function collectAudioUniformKeysFromParamWires(graph: NodeGraph, reachable: Set<string>): Set<string> {
  const keys = new Set<string>();
  for (const c of graph.connections) {
    if (c.disabled) continue;
    if (!c.targetParameter || !reachable.has(c.targetNodeId)) continue;
    if (!c.sourceNodeId.startsWith(VIRTUAL_NODE_PREFIX)) continue;
    const signalId = c.sourceNodeId.slice(VIRTUAL_NODE_PREFIX.length);
    if (signalId.startsWith('remap-')) {
      keys.add(`${signalId}.out`);
      continue;
    }
    const bandMatch = /^band-(.+)-(raw|remap)$/.exec(signalId);
    if (bandMatch) {
      const bandId = bandMatch[1] as string;
      const which = bandMatch[2] as 'raw' | 'remap';
      keys.add(which === 'raw' ? `${bandId}.band` : `${bandId}.remap`);
    }
  }
  return keys;
}

function buildUniformsForReachableNodes(
  graph: NodeGraph,
  nodeSpecs: Map<string, NodeSpec>,
  reachable: Set<string>,
  audioSetup: AudioSetup | null
): { uniforms: UniformMetadata[]; paramLayout: ParamLayout } {
  const uniformGen = new UniformGenerator(nodeSpecs, isAudioNodeHelper, getParameterDefaultValueHelper);
  const uniformNames = uniformGen.generateUniformNameMapping(graph, audioSetup);

  // For WGSL MVP we don't scan emitted code for uniform usage (WGSL doesn't contain GLSL uniform names).
  // Instead, include all parameter uniforms for nodes in the reachable slice.
  const wiredAudioKeys = collectAudioUniformKeysFromParamWires(graph, reachable);
  const usedUniforms = new Set<string>();
  for (const [key, uniformName] of uniformNames) {
    const nodeId = key.split('.')[0] as string;
    if (reachable.has(nodeId) || wiredAudioKeys.has(key)) usedUniforms.add(uniformName);
  }

  const uniforms = uniformGen.generateUniformMetadata(graph, uniformNames, usedUniforms, audioSetup);
  const paramLayout = computeParamLayout(uniforms);
  return { uniforms, paramLayout };
}
/**
 * Try to emit a `pass.blur.gaussian-separable.v1` pass plan for a graph that ends in
 * `... → blur → final-output`. Returns null when the pattern doesn't match. When it
 * matches, returns either a `supported: true` pass plan compilation or a
 * `supported: false` result with an explanatory reason.
 */
function tryCompileBlurPassPlan(
  graph: NodeGraph,
  nodeSpecs: Map<string, NodeSpec>,
  executionOrder: string[],
  finalOutputNodeId: string,
  audioSetup: AudioSetup | null,
  blurNodeId: string
): CompilationResult | null {
  const blurToFinal = graph.connections.find(
    (c) =>
      c.sourceNodeId === blurNodeId &&
      c.sourcePort === 'out' &&
      c.targetNodeId === finalOutputNodeId &&
      c.targetPort === 'in'
  );
  if (!blurToFinal) return null;

  const blurInLink = lookupInputConnection(graph, blurNodeId, 'in');
  if (!blurInLink) {
    return {
      backend: 'webgpu',
      supported: false,
      unsupportedReasons: [
        'pass.blur.gaussian-separable.v1: blur node has no upstream input',
      ],
      code: '',
      shaderCode: '',
      uniforms: [],
      metadata: { warnings: [], errors: [], executionOrder, finalOutputNodeId },
      paramLayout: {},
      resources: [],
    };
  }

  const subGraph: NodeGraph = {
    ...graph,
    nodes: graph.nodes.filter((n) => n.id !== blurNodeId),
    connections: [
      ...graph.connections.filter(
        (c) => c.sourceNodeId !== blurNodeId && c.targetNodeId !== blurNodeId
      ),
      {
        id: `__synthetic.blur-bypass.${blurNodeId}`,
        sourceNodeId: blurInLink.sourceNodeId,
        sourcePort: blurInLink.sourcePort,
        targetNodeId: finalOutputNodeId,
        targetPort: 'in',
      },
    ],
  };

  const subOrder = executionOrder.filter((id) => id !== blurNodeId);
  const subResult = compileWgslMvp(
    subGraph,
    nodeSpecs,
    subOrder,
    finalOutputNodeId,
    audioSetup
  );
  if (!subResult.supported) {
    const reasons = subResult.unsupportedReasons ?? ['unknown subgraph compile failure'];
    return {
      backend: 'webgpu',
      supported: false,
      unsupportedReasons: [
        'pass.blur.gaussian-separable.v1: upstream subgraph not WGSL-compatible',
        ...reasons,
      ],
      code: '',
      shaderCode: '',
      uniforms: subResult.uniforms,
      metadata: { warnings: [], errors: [], executionOrder, finalOutputNodeId },
      paramLayout: {},
      resources: [],
    };
  }

  const slotMax = Object.values(subResult.paramLayout).reduce((m, v) => Math.max(m, v), -1);
  let next = slotMax + 1;
  const paramSlots = {
    amount: next++,
    radius: next++,
    type: next++,
    direction: next++,
    centerX: next++,
    centerY: next++,
  };
  const paramLayout: ParamLayout = {
    ...subResult.paramLayout,
    [`${blurNodeId}.blurAmount`]: paramSlots.amount,
    [`${blurNodeId}.blurRadius`]: paramSlots.radius,
    [`${blurNodeId}.blurType`]: paramSlots.type,
    [`${blurNodeId}.blurDirection`]: paramSlots.direction,
    [`${blurNodeId}.blurCenterX`]: paramSlots.centerX,
    [`${blurNodeId}.blurCenterY`]: paramSlots.centerY,
  };

  /**
   * `RENDER_ATTACHMENT (16) | TEXTURE_BINDING (4) | COPY_SRC (2) | COPY_DST (8)`.
   * COPY_SRC/COPY_DST allow export readback paths to copy intermediates if needed.
   */
  const intermediateUsage = (16 | 4 | 2 | 8) as WebGpuTextureDesc['usage'];

  const webgpuPassPlan: WebGpuPassPlan = {
    kind: 'pass.blur.gaussian-separable.v1',
    nodeId: blurNodeId,
    inputWgsl: subResult.code,
    blurWgsl: BLUR_GAUSSIAN_SEPARABLE_BLUR_WGSL,
    presentWgsl: BLUR_GAUSSIAN_SEPARABLE_PRESENT_WGSL,
    intermediateTexture: {
      size: { kind: 'canvas' },
      format: 'rgba8unorm',
      usage: intermediateUsage,
      label: 'blur.gaussian-separable.intermediate',
    },
    paramSlots,
  };

  return {
    backend: 'webgpu',
    supported: true,
    code: subResult.code,
    shaderCode: '',
    uniforms: subResult.uniforms,
    metadata: {
      warnings: subResult.metadata.warnings,
      errors: [],
      executionOrder,
      finalOutputNodeId,
      previewDependencies: subResult.metadata.previewDependencies,
    },
    paramLayout,
    resources: [],
    webgpuPassPlan,
  };
}

/**
 * Try to emit a `pass.glow-bloom.v1` pass plan for a graph that ends in
 * `... -> glow-bloom -> final-output`. The upstream subgraph is compiled as
 * inline WGSL, then runtime performs threshold, blur, and combine passes.
 */
function tryCompileGlowBloomPassPlan(
  graph: NodeGraph,
  nodeSpecs: Map<string, NodeSpec>,
  executionOrder: string[],
  finalOutputNodeId: string,
  audioSetup: AudioSetup | null,
  glowNodeId: string
): CompilationResult | null {
  const glowToFinal = graph.connections.find(
    (c) =>
      c.sourceNodeId === glowNodeId &&
      c.sourcePort === 'out' &&
      c.targetNodeId === finalOutputNodeId &&
      c.targetPort === 'in'
  );
  if (!glowToFinal) return null;

  const glowInLink = lookupInputConnection(graph, glowNodeId, 'in');
  if (!glowInLink) {
    return {
      backend: 'webgpu',
      supported: false,
      unsupportedReasons: ['pass.glow-bloom.v1: glow-bloom node has no upstream input'],
      code: '',
      shaderCode: '',
      uniforms: [],
      metadata: { warnings: [], errors: [], executionOrder, finalOutputNodeId },
      paramLayout: {},
      resources: [],
    };
  }

  const subGraph: NodeGraph = {
    ...graph,
    nodes: graph.nodes.filter((n) => n.id !== glowNodeId),
    connections: [
      ...graph.connections.filter(
        (c) => c.sourceNodeId !== glowNodeId && c.targetNodeId !== glowNodeId
      ),
      {
        id: `__synthetic.glow-bloom-bypass.${glowNodeId}`,
        sourceNodeId: glowInLink.sourceNodeId,
        sourcePort: glowInLink.sourcePort,
        targetNodeId: finalOutputNodeId,
        targetPort: 'in',
      },
    ],
  };

  const subOrder = executionOrder.filter((id) => id !== glowNodeId);
  const subResult = compileWgslMvp(
    subGraph,
    nodeSpecs,
    subOrder,
    finalOutputNodeId,
    audioSetup
  );
  if (!subResult.supported) {
    const reasons = subResult.unsupportedReasons ?? ['unknown subgraph compile failure'];
    return {
      backend: 'webgpu',
      supported: false,
      unsupportedReasons: [
        'pass.glow-bloom.v1: upstream subgraph not WGSL-compatible',
        ...reasons,
      ],
      code: '',
      shaderCode: '',
      uniforms: subResult.uniforms,
      metadata: { warnings: [], errors: [], executionOrder, finalOutputNodeId },
      paramLayout: {},
      resources: [],
    };
  }

  const slotMax = Object.values(subResult.paramLayout).reduce((m, v) => Math.max(m, v), -1);
  let next = slotMax + 1;
  const paramSlots = {
    threshold: next++,
    intensity: next++,
    radius: next++,
    strength: next++,
  };
  const paramLayout: ParamLayout = {
    ...subResult.paramLayout,
    [`${glowNodeId}.glowThreshold`]: paramSlots.threshold,
    [`${glowNodeId}.glowIntensity`]: paramSlots.intensity,
    [`${glowNodeId}.glowRadius`]: paramSlots.radius,
    [`${glowNodeId}.glowStrength`]: paramSlots.strength,
  };

  /** `RENDER_ATTACHMENT | TEXTURE_BINDING | COPY_SRC | COPY_DST`. */
  const intermediateUsage = (16 | 4 | 2 | 8) as WebGpuTextureDesc['usage'];

  const webgpuPassPlan: WebGpuPassPlan = {
    kind: 'pass.glow-bloom.v1',
    nodeId: glowNodeId,
    inputWgsl: subResult.code,
    thresholdWgsl: GLOW_BLOOM_THRESHOLD_WGSL,
    blurWgsl: GLOW_BLOOM_BLUR_WGSL,
    combineWgsl: GLOW_BLOOM_COMBINE_WGSL,
    intermediateTexture: {
      size: { kind: 'canvas' },
      format: 'rgba8unorm',
      usage: intermediateUsage,
      label: 'glow-bloom.intermediate',
    },
    paramSlots,
  };

  return {
    backend: 'webgpu',
    supported: true,
    code: subResult.code,
    shaderCode: '',
    uniforms: subResult.uniforms,
    metadata: {
      warnings: subResult.metadata.warnings,
      errors: [],
      executionOrder,
      finalOutputNodeId,
      previewDependencies: subResult.metadata.previewDependencies,
    },
    paramLayout,
    resources: [],
    webgpuPassPlan,
  };
}

/**
 * Try to emit a `pass.crepuscular-rays.v1` pass plan for a graph that ends in
 * `... -> crepuscular-rays -> final-output`. The upstream subgraph is compiled as inline WGSL,
 * then runtime performs occluder-mask, radial sweep, and combine passes.
 */
function tryCompileCrepuscularRaysPassPlan(
  graph: NodeGraph,
  nodeSpecs: Map<string, NodeSpec>,
  executionOrder: string[],
  finalOutputNodeId: string,
  audioSetup: AudioSetup | null,
  crepNodeId: string
): CompilationResult | null {
  const crepToFinal = graph.connections.find(
    (c) =>
      c.sourceNodeId === crepNodeId &&
      c.sourcePort === 'out' &&
      c.targetNodeId === finalOutputNodeId &&
      c.targetPort === 'in'
  );
  if (!crepToFinal) return null;

  const crepInLink = lookupInputConnection(graph, crepNodeId, 'in');
  if (!crepInLink) {
    return {
      backend: 'webgpu',
      supported: false,
      unsupportedReasons: ['pass.crepuscular-rays.v1: crepuscular-rays node has no upstream input'],
      code: '',
      shaderCode: '',
      uniforms: [],
      metadata: { warnings: [], errors: [], executionOrder, finalOutputNodeId },
      paramLayout: {},
      resources: [],
    };
  }

  const subGraph: NodeGraph = {
    ...graph,
    nodes: graph.nodes.filter((n) => n.id !== crepNodeId),
    connections: [
      ...graph.connections.filter(
        (c) => c.sourceNodeId !== crepNodeId && c.targetNodeId !== crepNodeId
      ),
      {
        id: `__synthetic.crepuscular-rays-bypass.${crepNodeId}`,
        sourceNodeId: crepInLink.sourceNodeId,
        sourcePort: crepInLink.sourcePort,
        targetNodeId: finalOutputNodeId,
        targetPort: 'in',
      },
    ],
  };

  const subOrder = executionOrder.filter((id) => id !== crepNodeId);
  const subResult = compileWgslMvp(
    subGraph,
    nodeSpecs,
    subOrder,
    finalOutputNodeId,
    audioSetup
  );
  if (!subResult.supported) {
    const reasons = subResult.unsupportedReasons ?? ['unknown subgraph compile failure'];
    return {
      backend: 'webgpu',
      supported: false,
      unsupportedReasons: [
        'pass.crepuscular-rays.v1: upstream subgraph not WGSL-compatible',
        ...reasons,
      ],
      code: '',
      shaderCode: '',
      uniforms: subResult.uniforms,
      metadata: { warnings: [], errors: [], executionOrder, finalOutputNodeId },
      paramLayout: {},
      resources: [],
    };
  }

  const slotMax = Object.values(subResult.paramLayout).reduce((m, v) => Math.max(m, v), -1);
  let next = slotMax + 1;
  const paramSlots = {
    sourceX: next++,
    sourceY: next++,
    distanceFalloff: next++,
    intensity: next++,
    rayCount: next++,
    spread: next++,
    width: next++,
    rotationSpeed: next++,
    rotationOffset: next++,
  };
  const paramLayout: ParamLayout = {
    ...subResult.paramLayout,
    [`${crepNodeId}.sourceX`]: paramSlots.sourceX,
    [`${crepNodeId}.sourceY`]: paramSlots.sourceY,
    [`${crepNodeId}.distanceFalloff`]: paramSlots.distanceFalloff,
    [`${crepNodeId}.intensity`]: paramSlots.intensity,
    [`${crepNodeId}.rayCount`]: paramSlots.rayCount,
    [`${crepNodeId}.spread`]: paramSlots.spread,
    [`${crepNodeId}.width`]: paramSlots.width,
    [`${crepNodeId}.rotationSpeed`]: paramSlots.rotationSpeed,
    [`${crepNodeId}.rotationOffset`]: paramSlots.rotationOffset,
  };

  /** `RENDER_ATTACHMENT | TEXTURE_BINDING | COPY_SRC | COPY_DST`. */
  const intermediateUsage = (16 | 4 | 2 | 8) as WebGpuTextureDesc['usage'];

  const webgpuPassPlan: WebGpuPassPlan = {
    kind: 'pass.crepuscular-rays.v1',
    nodeId: crepNodeId,
    inputWgsl: subResult.code,
    occluderWgsl: CREPUSCULAR_RAYS_OCCLUDER_WGSL,
    sweepWgsl: CREPUSCULAR_RAYS_SWEEP_WGSL,
    combineWgsl: CREPUSCULAR_RAYS_COMBINE_WGSL,
    intermediateTexture: {
      size: { kind: 'canvas' },
      format: 'rgba8unorm',
      usage: intermediateUsage,
      label: 'crepuscular-rays.intermediate',
    },
    paramSlots,
  };

  return {
    backend: 'webgpu',
    supported: true,
    code: subResult.code,
    shaderCode: '',
    uniforms: subResult.uniforms,
    metadata: {
      warnings: subResult.metadata.warnings,
      errors: [],
      executionOrder,
      finalOutputNodeId,
      previewDependencies: subResult.metadata.previewDependencies,
    },
    paramLayout,
    resources: [],
    webgpuPassPlan,
  };
}

export function compileWgslMvp(
  graph: NodeGraph,
  nodeSpecs: Map<string, NodeSpec>,
  executionOrder: string[],
  finalOutputNodeId: string,
  audioSetup: AudioSetup | null
): CompilationResult {
  const reachable = computeUpstreamReachableNodeIds(graph, finalOutputNodeId);
  const reachableNodes = graph.nodes.filter((n) => reachable.has(n.id));

  // Task 10B: blur post-effect pass plan (separable Gaussian).
  // Pattern: `... → blur → final-output`. Compiles the upstream subgraph (excluding blur and
  // `final-output`) as a normal inline WGSL fragment program, then wraps it in a multi-pass
  // pipeline that runs horizontal + vertical Gaussian blur and presents.
  const blurNode = reachableNodes.find((n) => n.type === 'blur') ?? null;
  if (blurNode) {
    const blurResult = tryCompileBlurPassPlan(
      graph,
      nodeSpecs,
      executionOrder,
      finalOutputNodeId,
      audioSetup,
      blurNode.id
    );
    if (blurResult?.supported === true) return blurResult;
    // Pass plan missing or unsupported: continue with inline `blur` WGSL (same as topology where
    // blur is not wired directly to final-output).
  }

  // Glow/bloom post-effect pass plan: `... -> glow-bloom -> final-output`.
  const glowBloomNode = reachableNodes.find((n) => n.type === 'glow-bloom') ?? null;
  if (glowBloomNode) {
    const glowBloomResult = tryCompileGlowBloomPassPlan(
      graph,
      nodeSpecs,
      executionOrder,
      finalOutputNodeId,
      audioSetup,
      glowBloomNode.id
    );
    if (glowBloomResult) return glowBloomResult;
    // Falls through to unsupported handling below.
  }

  // Bokeh post-effect pass plan: `... -> bokeh -> final-output`.
  const bokehNode = reachableNodes.find((n) => n.type === 'bokeh') ?? null;
  if (bokehNode) {
    const bokehResult = tryCompileBokehPassPlan(
      graph,
      nodeSpecs,
      executionOrder,
      finalOutputNodeId,
      audioSetup,
      bokehNode.id
    );
    if (bokehResult?.supported === true) return bokehResult;
  }

  // Crepuscular-rays post-effect pass plan: `... -> crepuscular-rays -> final-output`.
  const crepuscularNode = reachableNodes.find((n) => n.type === 'crepuscular-rays') ?? null;
  if (crepuscularNode) {
    const crepResult = tryCompileCrepuscularRaysPassPlan(
      graph,
      nodeSpecs,
      executionOrder,
      finalOutputNodeId,
      audioSetup,
      crepuscularNode.id
    );
    if (crepResult) return crepResult;
    // Falls through to unsupported handling below.
  }

  const unsupportedTypes = Array.from(
    new Set(reachableNodes.map((n) => n.type).filter((t) => !WGSL_SUPPORTED_NODE_TYPES.has(t)))
  ).sort();

  if (unsupportedTypes.length > 0) {
    return {
      backend: 'webgpu',
      supported: false,
      unsupportedReasons: unsupportedTypes.map((t) => `unsupported node type: ${t}`),
      code: '',
      shaderCode: '',
      uniforms: [],
      metadata: { warnings: [], errors: [], executionOrder, finalOutputNodeId },
      paramLayout: {},
      resources: [],
    };
  }

  const genericRayFailures = validateGenericRaymarcherWebGpuMvp(graph, reachable);
  if (genericRayFailures.length > 0) {
    return {
      backend: 'webgpu',
      supported: false,
      unsupportedReasons: genericRayFailures,
      code: '',
      shaderCode: '',
      uniforms: [],
      metadata: { warnings: [], errors: [], executionOrder, finalOutputNodeId },
      paramLayout: {},
      resources: [],
    };
  }

  const { uniforms, paramLayout } = buildUniformsForReachableNodes(graph, nodeSpecs, reachable, audioSetup);

  const exprByOutput = new Map<string, Expr>();
  const helperFns = new Map<string, string>();

  const requireHelper = (id: string, wgsl: string): void => {
    if (helperFns.has(id)) return;
    helperFns.set(id, wgsl.trim());
  };

  const WGSL_HELPER_WGSL_MOD = `
fn wgslMod(a: f32, b: f32) -> f32 {
  return a - b * floor(a / b);
}
  `;

  const WGSL_HELPER_ROTATE2 = `
fn rotate2(p: vec2<f32>, angle: f32) -> vec2<f32> {
  let c = cos(angle);
  let s = sin(angle);
  return vec2<f32>(p.x * c - p.y * s, p.x * s + p.y * c);
}
  `;

  const setNodeOut = (nodeId: string, port: string, expr: Expr): void => {
    exprByOutput.set(`${nodeId}.${port}`, expr);
  };

  const resolveNodeOut = (nodeId: string, port: string): Expr | null => {
    return exprByOutput.get(`${nodeId}.${port}`) ?? null;
  };

  /**
   * Index of `targetParameter` connections by `${targetNodeId}.${targetParameter}`.
   * Lets WGSL emit substitute the source's value (incl. virtual audio remap output) into a parameter slot
   * when a wire targets a parameter (e.g. `constant-float -> sierpinski-tetra-sdf.scale`,
   * `audio-signal:remap-X -> ether-sdf.timeOffset`). Mirrors GLSL parameter input resolution.
   */
  const paramConnByKey = new Map<string, { sourceNodeId: string; sourcePort: string }>();
  for (const c of graph.connections) {
    if (c.targetParameter) {
      paramConnByKey.set(`${c.targetNodeId}.${c.targetParameter}`, {
        sourceNodeId: c.sourceNodeId,
        sourcePort: c.sourcePort,
      });
    }
  }

  /** Resolve a virtual audio source node id to its `params[i].x` slot expression, or null. */
  const resolveAudioVirtualSlot = (sourceNodeId: string): string | null => {
    if (!sourceNodeId.startsWith(VIRTUAL_NODE_PREFIX)) return null;
    const signalId = sourceNodeId.slice(VIRTUAL_NODE_PREFIX.length);
    if (signalId.startsWith('remap-')) {
      const idx = paramLayout[`${signalId}.out`];
      if (idx == null) return null;
      return `params[${idx}].x`;
    }
    const bandMatch = /^band-(.+)-(raw|remap)$/.exec(signalId);
    if (bandMatch) {
      const bandId = bandMatch[1] as string;
      const which = bandMatch[2] as 'raw' | 'remap';
      const key = which === 'raw' ? `${bandId}.band` : `${bandId}.remap`;
      const idx = paramLayout[key];
      if (idx == null) return null;
      return `params[${idx}].x`;
    }
    return null;
  };

  /**
   * Like {@link paramSlotExpr}, but first honors a `targetParameter` wire on `(nodeId, paramName)`:
   * - virtual audio source -> the audio uniform's `params[i].x` slot;
   * - regular node source -> the source node's emitted scalar expression (vec components via `.x`);
   * - else fall through to the static parameter slot (or `0.0` if the param is absent from layout).
   */
  const paramSlotExprWired = (
    layout: ParamLayout,
    nodeId: string,
    paramName: string,
    lane: 0 | 1 | 2 | 3
  ): string => {
    const conn = paramConnByKey.get(`${nodeId}.${paramName}`);
    if (conn) {
      const node = graph.nodes.find((n) => n.id === nodeId);
      const spec = node ? nodeSpecs.get(node.type) : undefined;
      const inputMode =
        node?.parameterInputModes?.[paramName] ??
        spec?.parameters?.[paramName]?.inputMode ??
        'override';

      const configExpr = paramSlotExpr(layout, nodeId, paramName, lane);

      const audioSlot = resolveAudioVirtualSlot(conn.sourceNodeId);
      const inputExpr =
        audioSlot != null
          ? audioSlot
          : (() => {
              const src = resolveNodeOut(conn.sourceNodeId, conn.sourcePort);
              if (!src) return null;
              if (src.type === 'f32') return `(${src.code})`;
              return `(${src.code}).x`;
            })();

      if (inputExpr != null) {
        switch (inputMode) {
          case 'override':
            return inputExpr;
          case 'add':
            return `((${configExpr}) + (${inputExpr}))`;
          case 'subtract':
            return `((${configExpr}) - (${inputExpr}))`;
          case 'multiply':
            return `((${configExpr}) * (${inputExpr}))`;
          default:
            return inputExpr;
        }
      }
    }
    return paramSlotExpr(layout, nodeId, paramName, lane);
  };

  /** Look up the declared `PortType` of an input port from the node's spec, or null when unknown. */
  const lookupInputPortType = (nodeId: string, port: string): PortType | null => {
    const node = graph.nodes.find((n) => n.id === nodeId);
    if (!node) return null;
    const spec = nodeSpecs.get(node.type);
    if (!spec) return null;
    return spec.inputs.find((i) => i.name === port)?.type ?? null;
  };

  /**
   * Resolve a node input.
   *
   * Parity with GLSL `MainCodeGeneratorNodeCode` / `getInputDefaultValue`:
   * - If the input has an incoming connection, return the source node's emitted expression
   *   (or `null` when that source itself failed to emit — a real upstream compile defect we
   *   want to surface, not mask).
   * - Else if `fallbackParam` is provided, return the parameter slot expression as `f32`.
   * - Else return a typed zero matching the port's declared type, so unconnected inputs
   *   compile deterministically (e.g. `blend-mode.base` unwired → `0.0`, treated as black).
   */
  const resolveInput = (nodeId: string, port: string, fallbackParam?: string): Expr | null => {
    const link = lookupInputConnection(graph, nodeId, port);
    if (link) {
      const src = resolveNodeOut(link.sourceNodeId, link.sourcePort);
      return src;
    }
    if (fallbackParam) {
      return { type: 'f32', code: paramSlotExprWired(paramLayout, nodeId, fallbackParam, 0) };
    }
    return defaultExprForPortType(lookupInputPortType(nodeId, port) ?? 'float');
  };

  const resolveInputF32 = (nodeId: string, port: string, fallbackParam?: string): Expr | null => {
    const v = resolveInput(nodeId, port, fallbackParam);
    if (!v) return null;
    if (v.type === 'f32') return v;
    // Match WebGL codegen behavior: when a float input is fed a vecN, use `.x`.
    if (v.type === 'vec2<f32>' || v.type === 'vec3<f32>' || v.type === 'vec4<f32>') {
      return { type: 'f32', code: `(${v.code}).x` };
    }
    return null;
  };

  const resolveInputVec2 = (nodeId: string, port: string, fallbackParams?: [string, string]): Expr | null => {
    const link = lookupInputConnection(graph, nodeId, port);
    if (link) {
      const src = resolveNodeOut(link.sourceNodeId, link.sourcePort);
      if (!src) return null;
      const base = coerceToType(src, 'vec2<f32>');
      if (!base) return null;
      if (!fallbackParams) return base;
      const h0 = paramConnByKey.has(`${nodeId}.${fallbackParams[0]}`);
      const h1 = paramConnByKey.has(`${nodeId}.${fallbackParams[1]}`);
      if (!h0 && !h1) return base;
      const x = h0 ? paramSlotExprWired(paramLayout, nodeId, fallbackParams[0], 0) : `(${base.code}).x`;
      const y = h1 ? paramSlotExprWired(paramLayout, nodeId, fallbackParams[1], 0) : `(${base.code}).y`;
      return { type: 'vec2<f32>', code: `vec2<f32>(${x}, ${y})` };
    }
    if (fallbackParams) {
      const x = paramSlotExprWired(paramLayout, nodeId, fallbackParams[0], 0);
      const y = paramSlotExprWired(paramLayout, nodeId, fallbackParams[1], 0);
      return { type: 'vec2<f32>', code: `vec2<f32>(${x}, ${y})` };
    }
    // GLSL parity: unconnected vec2 input with no fallback → vec2(0.0).
    return { type: 'vec2<f32>', code: 'vec2<f32>(0.0)' };
  };

  const resolveInputVec4 = (nodeId: string, port: string): Expr | null => {
    const link = lookupInputConnection(graph, nodeId, port);
    if (link) {
      const src = resolveNodeOut(link.sourceNodeId, link.sourcePort);
      if (!src) return null;
      return coerceToType(src, 'vec4<f32>');
    }
    // GLSL parity: unconnected vec4 input with no fallback → vec4(0.0).
    return { type: 'vec4<f32>', code: 'vec4<f32>(0.0)' };
  };

  const resolveInputVec3 = (nodeId: string, port: string): Expr | null => {
    const link = lookupInputConnection(graph, nodeId, port);
    if (!link) {
      // GLSL parity: unconnected vec3 input with no fallback → vec3(0.0).
      return { type: 'vec3<f32>', code: 'vec3<f32>(0.0)' };
    }
    const src = resolveNodeOut(link.sourceNodeId, link.sourcePort);
    if (!src) return null;
    return coerceToType(src, 'vec3<f32>');
  };

  /**
   * "Try" variants: return `null` when the input port is unconnected, so callers can chain a
   * semantic default with `??` (e.g. fragCoord defaults to `in.uv * resolution`, time defaults
   * to `globals.v0.x`). Use these instead of `resolveInput*` when the right default is *not*
   * the typed zero — those resolvers default to vec/float zero for GLSL parity.
   */
  const tryResolveInputF32 = (nodeId: string, port: string): Expr | null => {
    const link = lookupInputConnection(graph, nodeId, port);
    if (!link) return null;
    const src = resolveNodeOut(link.sourceNodeId, link.sourcePort);
    if (!src) return null;
    if (src.type === 'f32') return src;
    if (src.type === 'vec2<f32>' || src.type === 'vec3<f32>' || src.type === 'vec4<f32>') {
      return { type: 'f32', code: `(${src.code}).x` };
    }
    return null;
  };

  const tryResolveInputVec2 = (nodeId: string, port: string): Expr | null => {
    const link = lookupInputConnection(graph, nodeId, port);
    if (!link) return null;
    const src = resolveNodeOut(link.sourceNodeId, link.sourcePort);
    if (!src) return null;
    return coerceToType(src, 'vec2<f32>');
  };

  const resolveInputVec3WithFallback = (nodeId: string, port: string, fallbackParams: [string, string, string]): Expr | null => {
    const link = lookupInputConnection(graph, nodeId, port);
    if (link) {
      const src = resolveNodeOut(link.sourceNodeId, link.sourcePort);
      if (!src) return null;
      const base = asVec3(src);
      if (!base) return null;
      const h0 = paramConnByKey.has(`${nodeId}.${fallbackParams[0]}`);
      const h1 = paramConnByKey.has(`${nodeId}.${fallbackParams[1]}`);
      const h2 = paramConnByKey.has(`${nodeId}.${fallbackParams[2]}`);
      if (!h0 && !h1 && !h2) return base;
      const x = h0 ? paramSlotExprWired(paramLayout, nodeId, fallbackParams[0], 0) : `(${base.code}).x`;
      const y = h1 ? paramSlotExprWired(paramLayout, nodeId, fallbackParams[1], 0) : `(${base.code}).y`;
      const z = h2 ? paramSlotExprWired(paramLayout, nodeId, fallbackParams[2], 0) : `(${base.code}).z`;
      return { type: 'vec3<f32>', code: `vec3<f32>(${x}, ${y}, ${z})` };
    }
    const x = paramSlotExprWired(paramLayout, nodeId, fallbackParams[0], 0);
    const y = paramSlotExprWired(paramLayout, nodeId, fallbackParams[1], 0);
    const z = paramSlotExprWired(paramLayout, nodeId, fallbackParams[2], 0);
    return { type: 'vec3<f32>', code: `vec3<f32>(${x}, ${y}, ${z})` };
  };

  const resolveInputVec4WithFallback = (nodeId: string, port: string, fallbackParams: [string, string, string, string]): Expr | null => {
    const link = lookupInputConnection(graph, nodeId, port);
    if (link) {
      const src = resolveNodeOut(link.sourceNodeId, link.sourcePort);
      if (!src) return null;
      const base = asVec4(src);
      if (!base) return null;
      const h0 = paramConnByKey.has(`${nodeId}.${fallbackParams[0]}`);
      const h1 = paramConnByKey.has(`${nodeId}.${fallbackParams[1]}`);
      const h2 = paramConnByKey.has(`${nodeId}.${fallbackParams[2]}`);
      const h3 = paramConnByKey.has(`${nodeId}.${fallbackParams[3]}`);
      if (!h0 && !h1 && !h2 && !h3) return base;
      const x = h0 ? paramSlotExprWired(paramLayout, nodeId, fallbackParams[0], 0) : `(${base.code}).x`;
      const y = h1 ? paramSlotExprWired(paramLayout, nodeId, fallbackParams[1], 0) : `(${base.code}).y`;
      const z = h2 ? paramSlotExprWired(paramLayout, nodeId, fallbackParams[2], 0) : `(${base.code}).z`;
      const w = h3 ? paramSlotExprWired(paramLayout, nodeId, fallbackParams[3], 0) : `(${base.code}).w`;
      return { type: 'vec4<f32>', code: `vec4<f32>(${x}, ${y}, ${z}, ${w})` };
    }
    const x = paramSlotExprWired(paramLayout, nodeId, fallbackParams[0], 0);
    const y = paramSlotExprWired(paramLayout, nodeId, fallbackParams[1], 0);
    const z = paramSlotExprWired(paramLayout, nodeId, fallbackParams[2], 0);
    const w = paramSlotExprWired(paramLayout, nodeId, fallbackParams[3], 0);
    return { type: 'vec4<f32>', code: `vec4<f32>(${x}, ${y}, ${z}, ${w})` };
  };

  for (const nodeId of executionOrder) {
    if (!reachable.has(nodeId)) continue;
    const node = graph.nodes.find((n) => n.id === nodeId);
    if (!node) continue;

    switch (node.type) {
      case 'constant-float': {
        setNodeOut(nodeId, 'out', { type: 'f32', code: paramSlotExprWired(paramLayout, nodeId, 'value', 0) });
        break;
      }
      case 'constant-vec2': {
        const x = paramSlotExprWired(paramLayout, nodeId, 'x', 0);
        const y = paramSlotExprWired(paramLayout, nodeId, 'y', 0);
        setNodeOut(nodeId, 'out', { type: 'vec2<f32>', code: `vec2<f32>(${x}, ${y})` });
        break;
      }
      case 'constant-vec3': {
        const x = paramSlotExprWired(paramLayout, nodeId, 'x', 0);
        const y = paramSlotExprWired(paramLayout, nodeId, 'y', 0);
        const z = paramSlotExprWired(paramLayout, nodeId, 'z', 0);
        setNodeOut(nodeId, 'out', { type: 'vec3<f32>', code: `vec3<f32>(${x}, ${y}, ${z})` });
        break;
      }
      case 'constant-vec4': {
        const x = paramSlotExprWired(paramLayout, nodeId, 'x', 0);
        const y = paramSlotExprWired(paramLayout, nodeId, 'y', 0);
        const z = paramSlotExprWired(paramLayout, nodeId, 'z', 0);
        const w = paramSlotExprWired(paramLayout, nodeId, 'w', 0);
        setNodeOut(nodeId, 'out', { type: 'vec4<f32>', code: `vec4<f32>(${x}, ${y}, ${z}, ${w})` });
        break;
      }
      case 'uv-coordinates': {
        // Match the legacy GLSL `p` convention used by many nodes:
        // normalized screen space in [-1, 1] with aspect correction.
        const aspect = `(globals.v0.z / max(1.0, globals.v0.w))`;
        const p = `((in.uv * 2.0 - vec2<f32>(1.0, 1.0)) * vec2<f32>(${aspect}, 1.0))`;
        setNodeOut(nodeId, 'out', { type: 'vec2<f32>', code: p });
        break;
      }
      case 'time': {
        setNodeOut(nodeId, 'out', { type: 'f32', code: 'globals.v0.x' });
        break;
      }
      case 'resolution': {
        setNodeOut(nodeId, 'out', { type: 'vec2<f32>', code: 'globals.v0.zw' });
        break;
      }
      case 'fragment-coordinates': {
        // WebGL `gl_FragCoord.xy` (bottom-left origin) → derive from UV + resolution.
        // This is an approximation (pixel center semantics differ slightly), but keeps node behavior usable and deterministic.
        setNodeOut(nodeId, 'out', { type: 'vec2<f32>', code: `(in.uv * globals.v0.zw)` });
        break;
      }
      case 'oscillator-2d': {
        const tau = '6.283185307179586';
        const t = `(globals.v0.x * ${paramSlotExprWired(paramLayout, nodeId, 'globalSpeed', 0)} + ${paramSlotExprWired(paramLayout, nodeId, 'globalOffset', 0)})`;

        const layerCombineRaw = node.parameters['layerCombine'];
        const layerCombine = typeof layerCombineRaw === 'number' ? layerCombineRaw : 0;
        const layerCombineI = `${Math.max(0, Math.min(3, Math.round(layerCombine)))}`;

        const onf = (p: string): string => `select(0.0, 1.0, ${p} >= 0.5)`;
        const mix = (a: string, b: string, x: string): string => `(${a} * (1.0 - ${x}) + ${b} * ${x})`;

        const combineAxis = (prefix: 'x' | 'y'): string => {
          const o1 = onf(paramSlotExprWired(paramLayout, nodeId, `${prefix}1On`, 0));
          const o2 = onf(paramSlotExprWired(paramLayout, nodeId, `${prefix}2On`, 0));
          const o3 = onf(paramSlotExprWired(paramLayout, nodeId, `${prefix}3On`, 0));

          const amp1 = paramSlotExprWired(paramLayout, nodeId, `${prefix}1Amp`, 0);
          const amp2 = paramSlotExprWired(paramLayout, nodeId, `${prefix}2Amp`, 0);
          const amp3 = paramSlotExprWired(paramLayout, nodeId, `${prefix}3Amp`, 0);

          const f1 = paramSlotExprWired(paramLayout, nodeId, `${prefix}1Freq`, 0);
          const f2 = paramSlotExprWired(paramLayout, nodeId, `${prefix}2Freq`, 0);
          const f3 = paramSlotExprWired(paramLayout, nodeId, `${prefix}3Freq`, 0);

          const ph1 = paramSlotExprWired(paramLayout, nodeId, `${prefix}1Phase`, 0);
          const ph2 = paramSlotExprWired(paramLayout, nodeId, `${prefix}2Phase`, 0);
          const ph3 = paramSlotExprWired(paramLayout, nodeId, `${prefix}3Phase`, 0);

          const s1 = `sin(${t} * ${tau} * ${f1} + ${ph1})`;
          const s2 = `sin(${t} * ${tau} * ${f2} + ${ph2})`;
          const s3 = `sin(${t} * ${tau} * ${f3} + ${ph3})`;

          const t1 = `(${amp1} * ${s1})`;
          const t2 = `(${amp2} * ${s2})`;
          const t3 = `(${amp3} * ${s3})`;

          const c1 = mix('0.0', t1, o1);
          const c2 = mix('0.0', t2, o2);
          const c3 = mix('0.0', t3, o3);

          const sum = `(${c1} + ${c2} + ${c3})`;
          const w = `(max((abs(${amp1}) * ${o1} + abs(${amp2}) * ${o2} + abs(${amp3}) * ${o3}), 1e-6))`;
          const normalized = `(${sum} / ${w})`;

          const p1 = mix('1.0', t1, o1);
          const p2 = mix('1.0', t2, o2);
          const p3 = mix('1.0', t3, o3);
          const prod = `(${p1} * ${p2} * ${p3})`;
          const anyOn = `max(max(${o1}, ${o2}), ${o3})`;
          const prodOut = mix('0.0', prod, `select(0.0, 1.0, ${anyOn} >= 0.25)`);

          // Max |·| mode tie-break: prefer earlier layer on ties.
          const m1 = `(${o1} * abs(${t1}))`;
          const m2 = `(${o2} * abs(${t2}))`;
          const m3 = `(${o3} * abs(${t3}))`;
          const best12 = `select(${t1}, ${t2}, ${m2} > ${m1})`;
          const mag12 = `max(${m1}, ${m2})`;
          const best123 = `select(${best12}, ${t3}, ${m3} > ${mag12})`;

          if (layerCombineI === '0') return sum;
          if (layerCombineI === '1') return normalized;
          if (layerCombineI === '2') return prodOut;
          return best123;
        };

        const rawX = combineAxis('x');
        const rawY = combineAxis('y');

        const rotSpeed = paramSlotExprWired(paramLayout, nodeId, 'rotationSpeed', 0);
        const rotPhase = paramSlotExprWired(paramLayout, nodeId, 'rotationPhase', 0);
        const wobAmp = paramSlotExprWired(paramLayout, nodeId, 'rotWobbleAmp', 0);
        const wobFreq = paramSlotExprWired(paramLayout, nodeId, 'rotWobbleFreq', 0);
        const wobPhase = paramSlotExprWired(paramLayout, nodeId, 'rotWobblePhase', 0);
        const theta = `(${t} * ${tau} * ${rotSpeed} + ${rotPhase} + ${wobAmp} * sin(${t} * ${tau} * ${wobFreq} + ${wobPhase}))`;

        const c = `cos(${theta})`;
        const s = `sin(${theta})`;
        const rx = `(${c} * ${rawX} - ${s} * ${rawY})`;
        const ry = `(${s} * ${rawX} + ${c} * ${rawY})`;

        const offX = paramSlotExprWired(paramLayout, nodeId, 'offsetX', 0);
        const offY = paramSlotExprWired(paramLayout, nodeId, 'offsetY', 0);

        setNodeOut(nodeId, 'x', { type: 'f32', code: `(${rx} + ${offX})` });
        setNodeOut(nodeId, 'y', { type: 'f32', code: `(${ry} + ${offY})` });
        break;
      }
      case 'orbit-camera': {
        const pIn = resolveInputVec2(nodeId, 'in');
        if (!pIn) break;

        const orbitRadius = paramSlotExprWired(paramLayout, nodeId, 'orbitRadius', 0);
        const orbitSpeed = paramSlotExprWired(paramLayout, nodeId, 'orbitSpeed', 0);
        const phase = paramSlotExprWired(paramLayout, nodeId, 'phase', 0);
        const targetX = paramSlotExprWired(paramLayout, nodeId, 'targetX', 0);
        const targetY = paramSlotExprWired(paramLayout, nodeId, 'targetY', 0);
        const targetZ = paramSlotExprWired(paramLayout, nodeId, 'targetZ', 0);
        const inclination = paramSlotExprWired(paramLayout, nodeId, 'inclination', 0);
        const fovScale = paramSlotExprWired(paramLayout, nodeId, 'fovScale', 0);

        const target = `vec3<f32>(${targetX}, ${targetY}, ${targetZ})`;
        const angle = `(globals.v0.x * ${orbitSpeed} + radians(${phase}))`;
        const r = orbitRadius;
        const inc = inclination;
        const offset = `(${r} * vec3<f32>(cos(${angle}), -sin(${inc}) * sin(${angle}), cos(${inc}) * sin(${angle})))`;
        const ro = `(${target} + ${offset})`;
        const forward = `normalize(${target} - ${ro})`;
        const right = `normalize(cross(${forward}, vec3<f32>(0.0, 1.0, 0.0)))`;
        const up = `cross(${right}, ${forward})`;
        const rd = `normalize(${forward} + ((${pIn.code}).x * ${right} + (${pIn.code}).y * ${up}) * ${fovScale})`;

        setNodeOut(nodeId, 'ro', { type: 'vec3<f32>', code: ro });
        setNodeOut(nodeId, 'rd', { type: 'vec3<f32>', code: rd });
        break;
      }
      case 'look-at-camera': {
        const pIn = resolveInputVec2(nodeId, 'in');
        if (!pIn) break;

        const posX = paramSlotExprWired(paramLayout, nodeId, 'posX', 0);
        const posY = paramSlotExprWired(paramLayout, nodeId, 'posY', 0);
        const posZ = paramSlotExprWired(paramLayout, nodeId, 'posZ', 0);
        const lookatX = paramSlotExprWired(paramLayout, nodeId, 'lookatX', 0);
        const lookatY = paramSlotExprWired(paramLayout, nodeId, 'lookatY', 0);
        const lookatZ = paramSlotExprWired(paramLayout, nodeId, 'lookatZ', 0);
        const zoom = paramSlotExprWired(paramLayout, nodeId, 'zoom', 0);

        const ro = `vec3<f32>(${posX}, ${posY}, ${posZ})`;
        const lookat = `vec3<f32>(${lookatX}, ${lookatY}, ${lookatZ})`;
        const f = `normalize(${lookat} - ${ro})`;
        const r = `normalize(cross(vec3<f32>(0.0, 1.0, 0.0), ${f}))`;
        const u = `cross(${f}, ${r})`;
        const center = `(${ro} + ${f} * ${zoom})`;
        const i = `(${center} + (${pIn.code}).x * ${r} + (${pIn.code}).y * ${u})`;
        const rd = `normalize(${i} - ${ro})`;

        setNodeOut(nodeId, 'ro', { type: 'vec3<f32>', code: ro });
        setNodeOut(nodeId, 'rd', { type: 'vec3<f32>', code: rd });
        break;
      }
      case 'rotate': {
        const v = resolveInputVec2(nodeId, 'in');
        if (!v) break;
        const angle = paramSlotExprWired(paramLayout, nodeId, 'angle', 0);
        const cx = paramSlotExprWired(paramLayout, nodeId, 'centerX', 0);
        const cy = paramSlotExprWired(paramLayout, nodeId, 'centerY', 0);
        const center = `vec2<f32>(${cx}, ${cy})`;
        const off = `(${v.code} - ${center})`;
        const c = `cos(${angle})`;
        const s = `sin(${angle})`;
        setNodeOut(nodeId, 'out', {
          type: 'vec2<f32>',
          code: `(${center} + vec2<f32>((${off}).x * ${c} - (${off}).y * ${s}, (${off}).x * ${s} + (${off}).y * ${c}))`,
        });
        break;
      }
      case 'scale': {
        const v = resolveInputVec2(nodeId, 'in');
        if (!v) break;
        const sx = paramSlotExprWired(paramLayout, nodeId, 'scaleX', 0);
        const sy = paramSlotExprWired(paramLayout, nodeId, 'scaleY', 0);
        const cx = paramSlotExprWired(paramLayout, nodeId, 'centerX', 0);
        const cy = paramSlotExprWired(paramLayout, nodeId, 'centerY', 0);
        const center = `vec2<f32>(${cx}, ${cy})`;
        const s = `vec2<f32>(${sx}, ${sy})`;
        setNodeOut(nodeId, 'out', { type: 'vec2<f32>', code: `(${center} + (${v.code} - ${center}) * ${s})` });
        break;
      }
      case 'transform': {
        // Unified 2D transform: Flip → Scale → Rotate around pivot (matches `transform-2d` GLSL).
        const v = resolveInputVec2(nodeId, 'in');
        if (!v) break;
        const pivotX = paramSlotExprWired(paramLayout, nodeId, 'pivotX', 0);
        const pivotY = paramSlotExprWired(paramLayout, nodeId, 'pivotY', 0);
        const flipX = paramSlotExprWired(paramLayout, nodeId, 'flipX', 0);
        const flipY = paramSlotExprWired(paramLayout, nodeId, 'flipY', 0);
        const scaleX = paramSlotExprWired(paramLayout, nodeId, 'scaleX', 0);
        const scaleY = paramSlotExprWired(paramLayout, nodeId, 'scaleY', 0);
        const angle = paramSlotExprWired(paramLayout, nodeId, 'angle', 0);
        const C = `vec2<f32>(${pivotX}, ${pivotY})`;
        const p0 = `(${v.code} - ${C})`;
        const fx = `select(1.0, -1.0, ${flipX} > 0.5)`;
        const fy = `select(1.0, -1.0, ${flipY} > 0.5)`;
        const p1 = `vec2<f32>((${p0}).x * ${fx}, (${p0}).y * ${fy})`;
        const p2 = `(${p1} * vec2<f32>(${scaleX}, ${scaleY}))`;
        const c = `cos(radians(${angle}))`;
        const s = `sin(radians(${angle}))`;
        const p3 = `vec2<f32>((${p2}).x * ${c} - (${p2}).y * ${s}, (${p2}).x * ${s} + (${p2}).y * ${c})`;
        setNodeOut(nodeId, 'out', { type: 'vec2<f32>', code: `(${C} + ${p3})` });
        break;
      }
      case 'polar-coordinates': {
        const v = resolveInputVec2(nodeId, 'in');
        if (!v) break;

        const cx = paramSlotExprWired(paramLayout, nodeId, 'polarCenterX', 0);
        const cy = paramSlotExprWired(paramLayout, nodeId, 'polarCenterY', 0);
        const scaleA = paramSlotExprWired(paramLayout, nodeId, 'polarScale', 0);
        const scaleR = paramSlotExprWired(paramLayout, nodeId, 'polarRadiusScale', 0);
        const rot = paramSlotExprWired(paramLayout, nodeId, 'polarRotation', 0);

        const center = `vec2<f32>(${cx}, ${cy})`;
        const off = `(${v.code} - ${center})`;
        const angleNorm = `(atan2((${off}).y, (${off}).x) / 3.14159)`;
        const radius = `length(${off})`;

        const polarX = `(${angleNorm} * ${scaleA} + ${rot})`;
        const polarY = `(${radius} * ${scaleR})`;
        const ang = `(${polarX} * 3.14159)`;
        const back = `(${center} + vec2<f32>(cos(${ang}), sin(${ang})) * ${polarY})`;

        setNodeOut(nodeId, 'out', {
          type: 'vec2<f32>',
          code: back,
        });
        break;
      }
      case 'brick-tiling': {
        const p = resolveInputVec2(nodeId, 'in');
        if (!p) break;

        const scaleX = paramSlotExprWired(paramLayout, nodeId, 'brickScaleX', 0);
        const scaleY = paramSlotExprWired(paramLayout, nodeId, 'brickScaleY', 0);
        const offsetX = paramSlotExprWired(paramLayout, nodeId, 'offsetX', 0);
        const offsetY = paramSlotExprWired(paramLayout, nodeId, 'brickOffsetY', 0);
        const brickAmount = paramSlotExprWired(paramLayout, nodeId, 'brickAmount', 0);
        const brickOffsetX = paramSlotExprWired(paramLayout, nodeId, 'brickOffsetX', 0);

        const scale = `vec2<f32>(${scaleX}, ${scaleY})`;
        const offset = `vec2<f32>(${offsetX}, ${offsetY})`;
        const q = `(${p.code} * ${scale} + ${offset})`;
        const row = `floor((${q}).y)`;
        // WGSL float modulo via the same expansion used elsewhere: a - b * floor(a / b)
        const parity = `(${row} - 2.0 * floor(${row} / 2.0))`;
        const out = `fract(vec2<f32>((${q}).x + ${parity} * ${brickOffsetX} * ${brickAmount}, (${q}).y))`;

        setNodeOut(nodeId, 'out', { type: 'vec2<f32>', code: out });
        break;
      }
      case 'uv-block-glitch': {
        const p = resolveInputVec2(nodeId, 'in');
        if (!p) break;

        const seedBase = paramSlotExprWired(paramLayout, nodeId, 'uvBlockGlitchSeed', 0);
        const stepHz = paramSlotExprWired(paramLayout, nodeId, 'uvBlockGlitchSeedStepHz', 0);
        const seed = `(${seedBase} + floor(globals.v0.x * max(${stepHz}, 0.0)))`;
        const blocks = paramSlotExprWired(paramLayout, nodeId, 'uvBlockGlitchBlocks', 0);
        const vari = paramSlotExprWired(paramLayout, nodeId, 'uvBlockGlitchVariation', 0);
        const cxMin = paramSlotExprWired(paramLayout, nodeId, 'uvBlockGlitchCenterXMin', 0);
        const cxMax = paramSlotExprWired(paramLayout, nodeId, 'uvBlockGlitchCenterXMax', 0);
        const cyMin = paramSlotExprWired(paramLayout, nodeId, 'uvBlockGlitchCenterYMin', 0);
        const cyMax = paramSlotExprWired(paramLayout, nodeId, 'uvBlockGlitchCenterYMax', 0);
        const hwMin = paramSlotExprWired(paramLayout, nodeId, 'uvBlockGlitchHalfWMin', 0);
        const hwMax = paramSlotExprWired(paramLayout, nodeId, 'uvBlockGlitchHalfWMax', 0);
        const aspMin = paramSlotExprWired(paramLayout, nodeId, 'uvBlockGlitchAspectMin', 0);
        const aspMax = paramSlotExprWired(paramLayout, nodeId, 'uvBlockGlitchAspectMax', 0);
        const oxMin = paramSlotExprWired(paramLayout, nodeId, 'uvBlockGlitchOffXMin', 0);
        const oxMax = paramSlotExprWired(paramLayout, nodeId, 'uvBlockGlitchOffXMax', 0);
        const oyMin = paramSlotExprWired(paramLayout, nodeId, 'uvBlockGlitchOffYMin', 0);
        const oyMax = paramSlotExprWired(paramLayout, nodeId, 'uvBlockGlitchOffYMax', 0);

        requireHelper(
          'uvBlockGlitchRect',
          `
fn uvBlockGlitch_hash11(t: f32, seed: f32) -> f32 {
  var p3 = fract(vec3<f32>(t * 0.371 + seed, t + seed * 0.913, t * 0.017 + seed) * vec3<f32>(0.1031, 0.1030, 0.0973));
  p3 = p3 + vec3<f32>(dot(p3, p3.yxz + vec3<f32>(19.19)));
  return fract((p3.x + p3.y) * p3.z);
}

fn uvBlockGlitch_pick(a: f32, b: f32, t: f32, seed: f32, vari: f32) -> f32 {
  let mid = 0.5 * (a + b);
  let u = uvBlockGlitch_hash11(t, seed);
  let v = mix(a, b, u);
  return mix(mid, v, clamp(vari, 0.0, 1.0));
}

fn uvBlockGlitch_apply(
  p: vec2<f32>,
  nb: i32,
  seed: f32,
  vari: f32,
  cxMin: f32,
  cxMax: f32,
  cyMin: f32,
  cyMax: f32,
  hwMin: f32,
  hwMax: f32,
  aspMin: f32,
  aspMax: f32,
  oxMin: f32,
  oxMax: f32,
  oyMin: f32,
  oyMax: f32,
) -> vec2<f32> {
  let nbc = clamp(nb, 1, 16);
  var outUv = p;
  for (var i: i32 = 0; i < 16; i = i + 1) {
    if (i >= nbc) {
      break;
    }
    let fi = f32(i);
    let cx = uvBlockGlitch_pick(cxMin, cxMax, fi + 0.11, seed, vari);
    let cy = uvBlockGlitch_pick(cyMin, cyMax, fi + 0.27, seed, vari);
    let hw = uvBlockGlitch_pick(hwMin, hwMax, fi + 0.43, seed, vari);
    let asp = uvBlockGlitch_pick(aspMin, aspMax, fi + 0.59, seed, vari);
    let hh = hw / max(asp, 0.05);
    let ox = uvBlockGlitch_pick(oxMin, oxMax, fi + 0.71, seed, vari);
    let oy = uvBlockGlitch_pick(oyMin, oyMax, fi + 0.83, seed, vari);
    if (abs(p.x - cx) < hw && abs(p.y - cy) < hh) {
      outUv = p + vec2<f32>(ox, oy);
    }
  }
  return outUv;
}
          `
        );

        const nb = `i32(clamp(floor(${blocks} + 0.5), 1.0, 16.0))`;
        const code = `uvBlockGlitch_apply(${p.code}, ${nb}, ${seed}, clamp(${vari}, 0.0, 1.0), ${cxMin}, ${cxMax}, ${cyMin}, ${cyMax}, ${hwMin}, ${hwMax}, ${aspMin}, ${aspMax}, ${oxMin}, ${oxMax}, ${oyMin}, ${oyMax})`;
        setNodeOut(nodeId, 'out', { type: 'vec2<f32>', code });
        break;
      }
      case 'uv-band-shift': {
        const p = resolveInputVec2(nodeId, 'in');
        if (!p) break;

        const oriF = paramSlotExprWired(paramLayout, nodeId, 'uvBandShiftOrientation', 0);
        const ori = `i32(floor(${oriF} + 0.5))`;
        const seed = paramSlotExprWired(paramLayout, nodeId, 'uvBandShiftSeed', 0);
        const bandCount = paramSlotExprWired(paramLayout, nodeId, 'uvBandShiftBandCount', 0);
        const priMin = paramSlotExprWired(paramLayout, nodeId, 'uvBandShiftPriOffMin', 0);
        const priMax = paramSlotExprWired(paramLayout, nodeId, 'uvBandShiftPriOffMax', 0);
        const priSpr = paramSlotExprWired(paramLayout, nodeId, 'uvBandShiftPriSpread', 0);
        const secMin = paramSlotExprWired(paramLayout, nodeId, 'uvBandShiftSecSizeMin', 0);
        const secMax = paramSlotExprWired(paramLayout, nodeId, 'uvBandShiftSecSizeMax', 0);
        const secSpr = paramSlotExprWired(paramLayout, nodeId, 'uvBandShiftSecSpread', 0);

        requireHelper(
          'uvBandShiftHash11',
          `
fn uvBandShiftHash11(i: f32, seed: f32) -> f32 {
  var p3 = fract(vec3<f32>(i, seed, i + seed) * vec3<f32>(0.1031, 0.1030, 0.0973));
  p3 = p3 + vec3<f32>(dot(p3, p3.yxz + vec3<f32>(19.19)));
  return fract((p3.x + p3.y) * p3.z);
}
          `
        );
        requireHelper(
          'uvBandShift_normPartitionY',
          `
fn uvBandShift_normPartitionY(y: f32) -> f32 {
  return select(clamp(y, 0.0, 1.0), y * 0.5 + 0.5, y < 0.0);
}
          `
        );
        requireHelper(
          'uvBandShift_normPartitionX',
          `
fn uvBandShift_normPartitionX(x: f32, aspect: f32) -> f32 {
  let asp = max(aspect, 1e-6);
  let fromP = clamp(x / (2.0 * asp) + 0.5, 0.0, 1.0);
  return select(clamp(x, 0.0, 1.0), fromP, x < 0.0 || x > 1.0001);
}
          `
        );
        requireHelper(
          'uvBandShift_applyHorizontal',
          `
fn uvBandShift_applyHorizontal(
  p: vec2<f32>,
  n: i32,
  seed: f32,
  priMin: f32,
  priMax: f32,
  priSpr: f32,
  secMin: f32,
  secMax: f32,
  secSpr: f32,
) -> vec2<f32> {
  let ncl = clamp(n, 1, 64);
  var sh: array<f32, 64>;
  var sum: f32 = 0.0;
  for (var i: i32 = 0; i < 64; i = i + 1) {
    if (i >= ncl) {
      break;
    }
    let fi = f32(i);
    let r = mix(secMin, secMax, uvBandShiftHash11(fi, seed));
    let r0 = mix(secMin, secMax, uvBandShiftHash11(fi - 1.0, seed));
    let r1 = r;
    let r2 = mix(secMin, secMax, uvBandShiftHash11(fi + 1.0, seed));
    let blended = mix(r1, (r0 + 2.0 * r1 + r2) * 0.25, secSpr);
    sh[i] = max(blended, 1e-5);
    sum = sum + sh[i];
  }
  let invSum = 1.0 / max(sum, 1e-6);
  for (var i: i32 = 0; i < 64; i = i + 1) {
    if (i >= ncl) {
      break;
    }
    sh[i] = sh[i] * invSum;
  }
  for (var k: i32 = 0; k < 64; k = k + 1) {
    let i = ncl - 1 - k;
    if (i < 1) {
      break;
    }
    let jf = floor(uvBandShiftHash11(f32(i), seed + 213.45) * f32(i + 1));
    let ji = i32(min(max(jf, 0.0), f32(i)));
    let tmp = sh[i];
    sh[i] = sh[ji];
    sh[ji] = tmp;
  }
  let y = uvBandShift_normPartitionY(p.y);
  var bi: i32 = ncl - 1;
  var acc: f32 = 0.0;
  for (var i: i32 = 0; i < 64; i = i + 1) {
    if (i >= ncl) {
      break;
    }
    if (y < acc + sh[i]) {
      bi = i;
      break;
    }
    acc = acc + sh[i];
  }
  let fbi = f32(bi);
  let o0 = mix(priMin, priMax, uvBandShiftHash11(fbi - 1.0, seed + 31.17));
  let o1 = mix(priMin, priMax, uvBandShiftHash11(fbi, seed + 31.17));
  let o2 = mix(priMin, priMax, uvBandShiftHash11(fbi + 1.0, seed + 31.17));
  let ox = mix(o1, (o0 + 2.0 * o1 + o2) * 0.25, priSpr);
  return p + vec2<f32>(ox, 0.0);
}
          `
        );
        requireHelper(
          'uvBandShift_applyVertical',
          `
fn uvBandShift_applyVertical(
  p: vec2<f32>,
  aspect: f32,
  n: i32,
  seed: f32,
  priMin: f32,
  priMax: f32,
  priSpr: f32,
  secMin: f32,
  secMax: f32,
  secSpr: f32,
) -> vec2<f32> {
  let ncl = clamp(n, 1, 64);
  var sh: array<f32, 64>;
  var sum: f32 = 0.0;
  for (var i: i32 = 0; i < 64; i = i + 1) {
    if (i >= ncl) {
      break;
    }
    let fi = f32(i);
    let r = mix(secMin, secMax, uvBandShiftHash11(fi + 101.0, seed));
    let r0 = mix(secMin, secMax, uvBandShiftHash11(fi - 1.0 + 101.0, seed));
    let r1 = r;
    let r2 = mix(secMin, secMax, uvBandShiftHash11(fi + 1.0 + 101.0, seed));
    let blended = mix(r1, (r0 + 2.0 * r1 + r2) * 0.25, secSpr);
    sh[i] = max(blended, 1e-5);
    sum = sum + sh[i];
  }
  let invSum = 1.0 / max(sum, 1e-6);
  for (var i: i32 = 0; i < 64; i = i + 1) {
    if (i >= ncl) {
      break;
    }
    sh[i] = sh[i] * invSum;
  }
  for (var k: i32 = 0; k < 64; k = k + 1) {
    let i = ncl - 1 - k;
    if (i < 1) {
      break;
    }
    let jf = floor(uvBandShiftHash11(f32(i), seed + 419.77) * f32(i + 1));
    let ji = i32(min(max(jf, 0.0), f32(i)));
    let tmp = sh[i];
    sh[i] = sh[ji];
    sh[ji] = tmp;
  }
  let x = uvBandShift_normPartitionX(p.x, aspect);
  var bi: i32 = ncl - 1;
  var acc: f32 = 0.0;
  for (var i: i32 = 0; i < 64; i = i + 1) {
    if (i >= ncl) {
      break;
    }
    if (x < acc + sh[i]) {
      bi = i;
      break;
    }
    acc = acc + sh[i];
  }
  let fbi = f32(bi);
  let o0 = mix(priMin, priMax, uvBandShiftHash11(fbi - 1.0, seed + 67.91));
  let o1 = mix(priMin, priMax, uvBandShiftHash11(fbi, seed + 67.91));
  let o2 = mix(priMin, priMax, uvBandShiftHash11(fbi + 1.0, seed + 67.91));
  let oy = mix(o1, (o0 + 2.0 * o1 + o2) * 0.25, priSpr);
  return p + vec2<f32>(0.0, oy);
}
          `
        );

        const nExpr = `i32(clamp(floor(${bandCount} + 0.5), 1.0, 64.0))`;
        const priSprC = `clamp(${priSpr}, 0.0, 1.0)`;
        const secSprC = `clamp(${secSpr}, 0.0, 1.0)`;
        const aspect = `(globals.v0.z / max(1.0, globals.v0.w))`;
        const horiz = `uvBandShift_applyHorizontal(${p.code}, ${nExpr}, ${seed}, ${priMin}, ${priMax}, ${priSprC}, ${secMin}, ${secMax}, ${secSprC})`;
        const vert = `uvBandShift_applyVertical(${p.code}, ${aspect}, ${nExpr}, ${seed}, ${priMin}, ${priMax}, ${priSprC}, ${secMin}, ${secMax}, ${secSprC})`;
        const outExpr = `select(${vert}, ${horiz}, ${ori} == 0)`;
        setNodeOut(nodeId, 'out', { type: 'vec2<f32>', code: outExpr });
        break;
      }
      case 'radial-uv-warp': {
        const p = resolveInputVec2(nodeId, 'in');
        if (!p) break;

        const modeF = paramSlotExprWired(paramLayout, nodeId, 'warpMode', 0);
        const wm = `i32(floor(${modeF} + 0.5))`;
        const cx = paramSlotExprWired(paramLayout, nodeId, 'warpCenterX', 0);
        const cy = paramSlotExprWired(paramLayout, nodeId, 'warpCenterY', 0);

        const bulgeStrength = paramSlotExprWired(paramLayout, nodeId, 'bulgeStrength', 0);
        const bulgeRadius = paramSlotExprWired(paramLayout, nodeId, 'bulgeRadius', 0);
        const bulgeFalloff = paramSlotExprWired(paramLayout, nodeId, 'bulgeFalloff', 0);

        const fisheyeStrength = paramSlotExprWired(paramLayout, nodeId, 'fisheyeStrength', 0);
        const fisheyeAspect = paramSlotExprWired(paramLayout, nodeId, 'fisheyeAspect', 0);

        const spherizeRadius = paramSlotExprWired(paramLayout, nodeId, 'spherizeRadius', 0);
        const spherizeStrength = paramSlotExprWired(paramLayout, nodeId, 'spherizeStrength', 0);

        requireHelper(
          'bulgePinch',
          `
fn bulgePinch(p: vec2<f32>, center: vec2<f32>, strength: f32, radius: f32, falloff: f32) -> vec2<f32> {
  let offset = p - center;
  let dist = length(offset);
  if (dist < 0.0001) { return p; }
  let n = dist / max(radius, 0.001);
  let f = pow(1.0 - smoothstep(0.0, 1.0, n), falloff);
  let r = dist * (1.0 + strength * f);
  return center + normalize(offset) * r;
}
          `
        );
        requireHelper(
          'fisheye',
          `
fn fisheye(p: vec2<f32>, center: vec2<f32>, strength: f32, aspect: f32) -> vec2<f32> {
  let d = (p - center) * vec2<f32>(aspect, 1.0);
  let r = length(d);
  if (r < 0.0001) { return p; }
  let r2 = r * r;
  let rNew = r * (1.0 + strength * r2);
  let dNorm = d / r;
  let dNew = dNorm * rNew / vec2<f32>(aspect, 1.0);
  return center + dNew;
}
          `
        );
        requireHelper(
          'spherize',
          `
fn spherize(p: vec2<f32>, center: vec2<f32>, radius: f32, strength: f32) -> vec2<f32> {
  let d = (p - center) / max(radius, 0.001);
  let r = length(d);
  if (r >= 1.0) { return p; }
  let r2 = r * r;
  let f = 1.0 - r2;
  let z = sqrt(max(0.0, f));
  let theta = atan2(d.y, d.x);
  let phi = atan2(z, r);
  let rNew = mix(r, phi * 2.0 / 3.14159, strength);
  let dNew = vec2<f32>(cos(theta), sin(theta)) * rNew * radius;
  return center + dNew;
}
          `
        );

        const center = `vec2<f32>(${cx}, ${cy})`;
        const outExpr = `select(select(bulgePinch(${p.code}, ${center}, ${bulgeStrength}, ${bulgeRadius}, ${bulgeFalloff}), fisheye(${p.code}, ${center}, ${fisheyeStrength}, ${fisheyeAspect}), (${wm}) == 1), spherize(${p.code}, ${center}, ${spherizeRadius}, ${spherizeStrength}), (${wm}) == 2)`;
        setNodeOut(nodeId, 'out', { type: 'vec2<f32>', code: outExpr });
        break;
      }
      case 'mirror-flip': {
        const p = resolveInputVec2(nodeId, 'in');
        if (!p) break;
        const flipX = paramSlotExprWired(paramLayout, nodeId, 'mirrorFlipX', 0);
        const flipY = paramSlotExprWired(paramLayout, nodeId, 'mirrorFlipY', 0);
        const cx = paramSlotExprWired(paramLayout, nodeId, 'mirrorCenterX', 0);
        const cy = paramSlotExprWired(paramLayout, nodeId, 'mirrorCenterY', 0);
        const c = `vec2<f32>(${cx}, ${cy})`;
        const d = `(${p.code} - ${c})`;
        const fx = `select(1.0, -1.0, ${flipX} > 0.5)`;
        const fy = `select(1.0, -1.0, ${flipY} > 0.5)`;
        setNodeOut(nodeId, 'out', { type: 'vec2<f32>', code: `(${c} + (${d}) * vec2<f32>(${fx}, ${fy}))` });
        break;
      }
      case 'displace': {
        const uv = resolveInputVec2(nodeId, 'in');
        if (!uv) break;

        const mode = paramSlotExprWired(paramLayout, nodeId, 'displaceMode', 0);
        const scale = paramSlotExprWired(paramLayout, nodeId, 'displaceScale', 0);

        const ox = paramSlotExprWired(paramLayout, nodeId, 'offsetX', 0);
        const oy = paramSlotExprWired(paramLayout, nodeId, 'offsetY', 0);
        const offset = { type: 'vec2<f32>' as const, code: `vec2<f32>(${ox}, ${oy})` };

        const amt = { type: 'f32' as const, code: paramSlotExprWired(paramLayout, nodeId, 'amount', 0) };

        const angle = paramSlotExprWired(paramLayout, nodeId, 'directionalDisplaceAngle', 0);
        const dir = `vec2<f32>(cos(${angle}), sin(${angle}))`;
        const outDirectional = `(${uv.code} + ${dir} * (${amt.code} * ${scale}))`;
        const outVector = `(${uv.code} + ${offset.code} * ${scale})`;

        // Mode is an int param stored in float param buffer; treat >0.5 as directional mode.
        setNodeOut(nodeId, 'out', { type: 'vec2<f32>', code: `select(${outVector}, ${outDirectional}, ${mode} > 0.5)` });
        break;
      }
      case 'drive-home-lights': {
        const roIn = resolveInputVec3(nodeId, 'ro');
        const rdIn = resolveInputVec3(nodeId, 'rd');
        // GLSL parity: when `time` is unconnected, fall back to the global time uniform
        // (not zero) so the lights animate. `tryResolveInputF32` returns null on unconnected
        // so the `??` semantic default kicks in.
        const timeIn = tryResolveInputF32(nodeId, 'time') ?? { type: 'f32' as const, code: 'globals.v0.x' };
        if (!roIn || !rdIn || !timeIn) break;

        const skyLowL = paramSlotExprWired(paramLayout, nodeId, 'skyGradientLowL', 0);
        const skyLowC = paramSlotExprWired(paramLayout, nodeId, 'skyGradientLowC', 0);
        const skyLowH = paramSlotExprWired(paramLayout, nodeId, 'skyGradientLowH', 0);
        const skyHighL = paramSlotExprWired(paramLayout, nodeId, 'skyGradientHighL', 0);
        const skyHighC = paramSlotExprWired(paramLayout, nodeId, 'skyGradientHighC', 0);
        const skyHighH = paramSlotExprWired(paramLayout, nodeId, 'skyGradientHighH', 0);
        const skyStrength = paramSlotExprWired(paramLayout, nodeId, 'skyStrength', 0);
        const timeScale = paramSlotExprWired(paramLayout, nodeId, 'timeScale', 0);
        const laneBias = paramSlotExprWired(paramLayout, nodeId, 'laneBias', 0);

        requireHelper(
          'drive-home-lights',
          `
fn dhlOklchToRgb(oklch: vec3<f32>) -> vec3<f32> {
  let l = oklch.x;
  let c = oklch.y;
  let h = oklch.z * 3.14159265359 / 180.0;
  let a_ = c * cos(h);
  let b_ = c * sin(h);
  let l_ = l + 0.3963377774 * a_ + 0.2158037573 * b_;
  let m_ = l - 0.1055613458 * a_ - 0.0638541728 * b_;
  let s_ = l - 0.0894841775 * a_ - 1.2914855480 * b_;
  let l3 = l_ * l_ * l_;
  let m3 = m_ * m_ * m_;
  let s3 = s_ * s_ * s_;
  let r = 4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3;
  let g = -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3;
  let bl = -0.0041960863 * l3 - 0.7034186147 * m3 + 1.7076147010 * s3;
  return clamp(vec3<f32>(r, g, bl), vec3<f32>(0.0), vec3<f32>(1.0));
}

fn dhl_N(tIn: f32) -> f32 {
  return fract(sin(tIn * 10234.324) * 123423.23512);
}

fn dhl_N31(p: f32) -> vec3<f32> {
  var p3 = fract(vec3<f32>(p) * vec3<f32>(0.1031, 0.11369, 0.13787));
  p3 = p3 + vec3<f32>(dot(p3, p3.yzx + vec3<f32>(19.19)));
  return fract(vec3<f32>(
    (p3.x + p3.y) * p3.z,
    (p3.x + p3.z) * p3.y,
    (p3.y + p3.z) * p3.x
  ));
}

fn dhl_DistLine(ro: vec3<f32>, rd: vec3<f32>, p: vec3<f32>) -> f32 {
  return length(cross(p - ro, rd));
}

fn dhl_Remap(a: f32, b: f32, c: f32, d: f32, t: f32) -> f32 {
  return ((t - a) / (b - a)) * (d - c) + c;
}

fn dhl_Bokeh(ro: vec3<f32>, rd: vec3<f32>, p: vec3<f32>, size: f32, blur: f32) -> f32 {
  let d = dhl_DistLine(ro, rd, p);
  var m = smoothstep(size, size * (1.0 - blur), d);
  m = m * mix(0.7, 1.0, smoothstep(0.8 * size, size, d));
  return m;
}

fn dhl_StreetLights(ro: vec3<f32>, rd: vec3<f32>, i: f32, t: f32) -> vec3<f32> {
  let side = sign(rd.x);
  let offset = max(side, 0.0) * (1.0 / 16.0);
  let z = fract(i - t + offset);
  let p = vec3<f32>(2.0 * side, 2.0, z * 60.0);
  var distFade = dhl_Remap(1.0, 0.7, 0.1, 1.5, 1.0 - pow(1.0 - z, 6.0));
  distFade = distFade * (1.0 - z);
  let m = dhl_Bokeh(ro, rd, p, 0.05 * length(p - ro), 0.1) * distFade;
  return m * vec3<f32>(1.0, 0.7, 0.3);
}

fn dhl_HeadLights(ro: vec3<f32>, rd: vec3<f32>, i: f32, t: f32) -> vec3<f32> {
  let z = fract(-t * 2.0 + i);
  let p = vec3<f32>(-0.3, 0.1, z * 40.0);
  let d = length(p - ro);
  var size = mix(0.03, 0.05, smoothstep(0.02, 0.07, z)) * d;
  var blur = 0.1;
  var m = 0.0;
  m = m + dhl_Bokeh(ro, rd, p - vec3<f32>(0.08, 0.0, 0.0), size, blur);
  m = m + dhl_Bokeh(ro, rd, p + vec3<f32>(0.08, 0.0, 0.0), size, blur);
  m = m + dhl_Bokeh(ro, rd, p + vec3<f32>(0.1, 0.0, 0.0), size, blur);
  m = m + dhl_Bokeh(ro, rd, p - vec3<f32>(0.1, 0.0, 0.0), size, blur);
  let distFade = max(0.01, pow(1.0 - z, 9.0));
  blur = 0.8;
  size = size * 2.5;
  var r = 0.0;
  r = r + dhl_Bokeh(ro, rd, p + vec3<f32>(-0.09, -0.2, 0.0), size, blur);
  r = r + dhl_Bokeh(ro, rd, p + vec3<f32>(0.09, -0.2, 0.0), size, blur);
  r = r * distFade * distFade;
  return vec3<f32>(0.8, 0.8, 1.0) * (m + r) * distFade;
}

fn dhl_TailLights(ro: vec3<f32>, rd: vec3<f32>, offset: f32, t: f32, laneBias: f32) -> vec3<f32> {
  var t2 = t * 1.5 + offset;
  let id = floor(t2) + offset;
  let n = dhl_N31(id);
  var laneId = smoothstep(laneBias, laneBias + 0.01, n.y);
  let ft = fract(t2);
  let z = 3.0 - ft * 3.0;
  laneId = laneId * smoothstep(0.2, 1.5, z);
  let lane = mix(0.6, 0.3, laneId);
  let p = vec3<f32>(lane, 0.1, z);
  var size = 0.05 * length(p - ro);
  let blur = 0.1;
  var m = dhl_Bokeh(ro, rd, p - vec3<f32>(0.08, 0.0, 0.0), size, blur) + dhl_Bokeh(ro, rd, p + vec3<f32>(0.08, 0.0, 0.0), size, blur);
  let bs = n.z * 3.0;
  let brake = smoothstep(bs, bs + 0.01, z) * smoothstep(bs + 0.01, bs, z - 0.5 * n.y);
  m = m + (dhl_Bokeh(ro, rd, p + vec3<f32>(0.1, 0.0, 0.0), size, blur) + dhl_Bokeh(ro, rd, p - vec3<f32>(0.1, 0.0, 0.0), size, blur)) * brake;
  let refSize = size * 2.5;
  m = m + dhl_Bokeh(ro, rd, p + vec3<f32>(-0.09, -0.2, 0.0), refSize, 0.8);
  m = m + dhl_Bokeh(ro, rd, p + vec3<f32>(0.09, -0.2, 0.0), refSize, 0.8);
  var col = vec3<f32>(1.0, 0.1, 0.1) * m * ft;
  var b = dhl_Bokeh(ro, rd, p + vec3<f32>(0.12, 0.0, 0.0), size, blur);
  b = b + dhl_Bokeh(ro, rd, p + vec3<f32>(0.12, -0.2, 0.0), refSize, 0.8) * 0.2;
  var blinker = vec3<f32>(1.0, 0.7, 0.2);
  blinker = blinker * smoothstep(1.5, 1.4, z) * smoothstep(0.2, 0.3, z);
  blinker = blinker * clamp(sin(t2 * 200.0) * 100.0, 0.0, 1.0);
  blinker = blinker * laneId;
  col = col + blinker * b;
  return col;
}

fn dhl_EnvironmentLights(ro: vec3<f32>, rd: vec3<f32>, i: f32, t: f32) -> vec3<f32> {
  let n = dhl_N(i + floor(t));
  let side = sign(rd.x);
  let offset = max(side, 0.0) * (1.0 / 16.0);
  let z = fract(i - t + offset + fract(n * 234.0));
  let n2 = fract(n * 100.0);
  let p = vec3<f32>((3.0 + n) * side, n2 * n2 * n2 * 1.0, z * 60.0);
  var distFade = dhl_Remap(1.0, 0.7, 0.1, 1.5, 1.0 - pow(1.0 - z, 6.0));
  var m = dhl_Bokeh(ro, rd, p, 0.05 * length(p - ro), 0.1);
  m = m * distFade * distFade * 0.5;
  m = m * (1.0 - pow(sin(z * 6.2831853 * 20.0 * n) * 0.5 + 0.5, 20.0));
  let randomCol = vec3<f32>(fract(n * -34.5), fract(n * 4572.0), fract(n * 1264.0));
  var col2 = mix(vec3<f32>(1.0, 0.1, 0.1), vec3<f32>(1.0, 0.7, 0.3), fract(n * -65.42));
  col2 = mix(col2, randomCol, n);
  return m * col2 * 0.2;
}

fn dhl_eval(
  ro: vec3<f32>,
  rd: vec3<f32>,
  wallTime: f32,
  skyLowL: f32,
  skyLowC: f32,
  skyLowH: f32,
  skyHighL: f32,
  skyHighC: f32,
  skyHighH: f32,
  skyStrength: f32,
  timeScale: f32,
  laneBias: f32
) -> vec3<f32> {
  let t = wallTime * timeScale;
  var col = vec3<f32>(0.0);
  let stp8: f32 = 0.125;
  let stp16: f32 = 0.0625;
  for (var ii: i32 = 0; ii < 8; ii = ii + 1) {
    let i = f32(ii) * stp8;
    col = col + dhl_StreetLights(ro, rd, i, t);
  }
  for (var jj: i32 = 0; jj < 8; jj = jj + 1) {
    let i = f32(jj) * stp8;
    let n = dhl_N(i + floor(t));
    col = col + dhl_HeadLights(ro, rd, i + n * stp8 * 0.7, t);
  }
  for (var kk: i32 = 0; kk < 16; kk = kk + 1) {
    let i = f32(kk) * stp16;
    col = col + dhl_EnvironmentLights(ro, rd, i, t);
  }
  col = col + dhl_TailLights(ro, rd, 0.0, t, laneBias);
  col = col + dhl_TailLights(ro, rd, 0.5, t, laneBias);
  let skyT = clamp(rd.y, 0.0, 1.0);
  let skyLowRgb = dhlOklchToRgb(vec3<f32>(skyLowL, skyLowC, skyLowH));
  let skyHighRgb = dhlOklchToRgb(vec3<f32>(skyHighL, skyHighC, skyHighH));
  let skyTint = mix(skyLowRgb, skyHighRgb, skyT);
  col = col + skyT * skyTint * skyStrength;
  return col;
}
          `
        );

        const out = `dhl_eval(${roIn.code}, ${rdIn.code}, ${timeIn.code}, ${skyLowL}, ${skyLowC}, ${skyLowH}, ${skyHighL}, ${skyHighC}, ${skyHighH}, ${skyStrength}, ${timeScale}, ${laneBias})`;
        setNodeOut(nodeId, 'out', { type: 'vec3<f32>', code: out });
        break;
      }
      case 'infinite-zoom': {
        const uv = resolveInputVec2(nodeId, 'in');
        if (!uv) break;

        const motionIn = paramSlotExprWired(paramLayout, nodeId, 'infiniteZoomMotion', 0);
        const cx = paramSlotExprWired(paramLayout, nodeId, 'infiniteZoomCenterX', 0);
        const cy = paramSlotExprWired(paramLayout, nodeId, 'infiniteZoomCenterY', 0);
        const loopPeriod = paramSlotExprWired(paramLayout, nodeId, 'infiniteZoomLoopPeriod', 0);
        const stepIn = paramSlotExprWired(paramLayout, nodeId, 'infiniteZoomStep', 0);
        const depthIn = paramSlotExprWired(paramLayout, nodeId, 'infiniteZoomDepth', 0);

        const motion = `clamp(i32(floor(${motionIn} + 0.5)), 0, 2)`;
        const center = `vec2<f32>(${cx}, ${cy})`;
        const p = `(${uv.code} - ${center})`;
        const tau = '6.283185307179586';
        const stepSafe = `max(${stepIn}, 1.016)`;
        const depth = `clamp(${depthIn}, 0.01, 1.0)`;
        const periodSafe = `max(${loopPeriod}, 0.2)`;
        const omega = `(globals.v0.x * (${tau} / ${periodSafe}))`;
        const phase = `fract(globals.v0.x / ${periodSafe})`;
        const maxTeFull = `(85.0 / log(${stepSafe}))`;
        const maxTeCap = `min(${maxTeFull}, 18.0)`;
        const tePeak = `(${depth} * ${maxTeCap})`;
        const tePingPong = `(${tePeak} * 0.5 * (1.0 - cos(${omega})))`;
        const teSnapIn = `(${phase} * ${tePeak})`;
        const teSnapOut = `((1.0 - ${phase}) * ${tePeak})`;
        const te = `select(select(${tePingPong}, ${teSnapIn}, (${motion}) == 1), ${teSnapOut}, (${motion}) == 2)`;
        const s = `pow(${stepSafe}, ${te})`;
        const q = `(${p} * ${s})`;
        const wrapped = `(fract(${q} * 0.5 + vec2<f32>(0.5, 0.5)) * 2.0 - vec2<f32>(1.0, 1.0))`;
        setNodeOut(nodeId, 'out', { type: 'vec2<f32>', code: `(${center} + ${wrapped})` });
        break;
      }
      case 'iridescent-tunnel': {
        const uvIn = resolveInputVec2(nodeId, 'in');
        if (!uvIn) break;

        const centerX = paramSlotExprWired(paramLayout, nodeId, 'centerX', 0);
        const centerY = paramSlotExprWired(paramLayout, nodeId, 'centerY', 0);
        const rep = paramSlotExprWired(paramLayout, nodeId, 'repetitionScale', 0);
        const tubeR = paramSlotExprWired(paramLayout, nodeId, 'tubeRadius', 0);
        const wFreq = paramSlotExprWired(paramLayout, nodeId, 'warpFreq', 0);
        const wStr = paramSlotExprWired(paramLayout, nodeId, 'warpStrength', 0);
        const camSpeed = paramSlotExprWired(paramLayout, nodeId, 'cameraSpeed', 0);
        const rotSpeed = paramSlotExprWired(paramLayout, nodeId, 'rotateSpeed', 0);
        const stepsF = paramSlotExprWired(paramLayout, nodeId, 'raymarchSteps', 0);
        const densScale = paramSlotExprWired(paramLayout, nodeId, 'densityScale', 0);
        const iridMix = paramSlotExprWired(paramLayout, nodeId, 'iridescenceMix', 0);
        const iridShift = paramSlotExprWired(paramLayout, nodeId, 'iridescenceShift', 0);
        const fov = paramSlotExprWired(paramLayout, nodeId, 'fovScale', 0);
        const cAL = paramSlotExprWired(paramLayout, nodeId, 'colorAL', 0);
        const cAC = paramSlotExprWired(paramLayout, nodeId, 'colorAC', 0);
        const cAH = paramSlotExprWired(paramLayout, nodeId, 'colorAH', 0);
        const cBL = paramSlotExprWired(paramLayout, nodeId, 'colorBL', 0);
        const cBC = paramSlotExprWired(paramLayout, nodeId, 'colorBC', 0);
        const cBH = paramSlotExprWired(paramLayout, nodeId, 'colorBH', 0);

        requireHelper(
          'iridescent-tunnel',
          `
fn it_oklchToRgb(oklch: vec3<f32>) -> vec3<f32> {
  let l = oklch.x;
  let c = oklch.y;
  let h = oklch.z * 3.14159265359 / 180.0;
  let a = c * cos(h);
  let b = c * sin(h);
  let l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  let m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  let s_ = l - 0.0894841775 * a - 1.2914855480 * b;
  let l3 = l_ * l_ * l_;
  let m3 = m_ * m_ * m_;
  let s3 = s_ * s_ * s_;
  let r = 4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3;
  let g = -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3;
  let bl = -0.0041960863 * l3 - 0.7034186147 * m3 + 1.7076147010 * s3;
  return clamp(vec3<f32>(r, g, bl), vec3<f32>(0.0), vec3<f32>(1.0));
}

fn it_rotZMat(a: f32) -> mat3x3<f32> {
  let c = cos(a);
  let s = sin(a);
  return mat3x3<f32>(vec3<f32>(c, s, 0.0), vec3<f32>(-s, c, 0.0), vec3<f32>(0.0, 0.0, 1.0));
}

fn it_modDomain(q: vec3<f32>, rep: f32) -> vec3<f32> {
  let r = vec3<f32>(rep, rep, rep);
  return q - r * floor((q + r * 0.5) / r);
}

fn it_mapTunnel(p: vec3<f32>, repIn: f32, r: f32, wFreq: f32, wStr: f32, angle: f32) -> f32 {
  let rep = clamp(repIn, 0.1, 2.0);
  var q = p;
  q.x = q.x + sin(q.z * wFreq) * wStr;
  q.y = q.y + cos(q.z * wFreq * 1.3) * wStr;
  q = it_rotZMat(angle) * q;
  q = it_modDomain(q, rep);
  return length(q.xy) - r;
}

fn it_marchCol(
  uv: vec2<f32>,
  center: vec2<f32>,
  rep: f32,
  tubeR: f32,
  wFreq: f32,
  wStr: f32,
  rotateSpeed: f32,
  camSpeed: f32,
  fovScale: f32,
  maxSteps: i32,
  densScale: f32,
  iridMix: f32,
  iridShift: f32,
  colorAL: f32,
  colorAC: f32,
  colorAH: f32,
  colorBL: f32,
  colorBC: f32,
  colorBH: f32,
  wallTime: f32
) -> vec4<f32> {
  let repCl = clamp(rep, 0.1, 2.0);
  let rCl = clamp(tubeR, 0.02, 0.5);
  let wStrCl = clamp(wStr, 0.0, 0.5);
  let angle = wallTime * rotateSpeed;
  let fov = fovScale;
  let dens = clamp(densScale, 0.2, 3.0);
  let iMix = clamp(iridMix, 0.0, 1.0);
  let iShift = clamp(iridShift, 0.0, 1.0);
  let colorA = it_oklchToRgb(vec3<f32>(clamp(colorAL, 0.0, 1.0), clamp(colorAC, 0.0, 0.4), colorAH));
  let colorB = it_oklchToRgb(vec3<f32>(clamp(colorBL, 0.0, 1.0), clamp(colorBC, 0.0, 0.4), colorBH));

  let ro = vec3<f32>(0.0, 0.0, -wallTime * camSpeed);
  let cCl = vec2<f32>(clamp(center.x, -2.0, 2.0), clamp(center.y, -2.0, 2.0));
  let uvN = (uv - cCl) * 2.0;
  var uvF = uvN * fov;
  let rd = normalize(vec3<f32>(uvF.x, uvF.y, -1.0));

  var acc = vec4<f32>(0.0, 0.0, 0.0, 0.0);
  var t: f32 = 0.0;
  let maxDist: f32 = 30.0;

  for (var i: i32 = 0; i < 128; i = i + 1) {
    if (i >= maxSteps) { break; }
    let p = ro + t * rd;
    var d = it_mapTunnel(p, repCl, rCl, wFreq, wStrCl, angle);
    d = max(d, 0.001);

    // Avoid NaNs when p.xy == 0 (first step starts at origin in XY).
    let cylLen = length(vec2<f32>(p.x, p.y));
    var cylN = vec3<f32>(0.0, 0.0, 1.0);
    if (cylLen > 1e-5) {
      cylN = vec3<f32>(p.x / cylLen, p.y / cylLen, 0.0);
    }
    var viewF = 1.0 - abs(dot(rd, cylN));
    viewF = pow(viewF, 1.5);
    let iridColor = mix(colorA, colorB, viewF * iShift + (1.0 - iShift) * 0.5);
    let baseColor = mix(vec3<f32>(0.15, 0.2, 0.35), iridColor, iMix);

    let contrib = (1.0 / (1.0 + d * 8.0)) * dens * 0.08;
    acc = vec4<f32>(
      acc.xyz + baseColor * contrib * max(t, 0.05),
      acc.w + contrib * 0.5
    );

    t = t + max(d * 0.5, 0.008);
    if (t > maxDist) { break; }
  }

  let rgb = acc.xyz / (1.0 + acc.w);
  let a = clamp(acc.w * 1.2, 0.0, 1.0);
  return vec4<f32>(rgb, a);
}
          `
        );

        const maxSteps = `clamp(i32(${stepsF} + 0.5), 24, 128)`;
        const center = `vec2<f32>(${centerX}, ${centerY})`;
        const out = `it_marchCol(${uvIn.code}, ${center}, ${rep}, ${tubeR}, ${wFreq}, ${wStr}, ${rotSpeed}, ${camSpeed}, ${fov}, ${maxSteps}, ${densScale}, ${iridMix}, ${iridShift}, ${cAL}, ${cAC}, ${cAH}, ${cBL}, ${cBC}, ${cBH}, globals.v0.x)`;
        setNodeOut(nodeId, 'out', { type: 'vec4<f32>', code: out });
        break;
      }
      case 'kaleidoscope': {
        const uv = resolveInputVec2(nodeId, 'in');
        if (!uv) break;

        const cx = paramSlotExprWired(paramLayout, nodeId, 'kaleidCenterX', 0);
        const cy = paramSlotExprWired(paramLayout, nodeId, 'kaleidCenterY', 0);
        const segmentsF = paramSlotExprWired(paramLayout, nodeId, 'kaleidSegments', 0);
        const rotation = paramSlotExprWired(paramLayout, nodeId, 'kaleidRotation', 0);
        const smoothEdge = paramSlotExprWired(paramLayout, nodeId, 'kaleidEdgeSmooth', 0);

        requireHelper(
          'kaleidoscope',
          `
fn kaleidoscopeFold(p: vec2<f32>, segments: i32, rotation: f32, smoothEdge: f32) -> vec2<f32> {
  var angle = atan2(p.y, p.x);
  let radius = length(p);

  // angle = mod(angle + rotation, TAU)
  let tau = 6.28318;
  angle = angle + rotation;
  angle = angle - tau * floor(angle / tau);

  let segAngle = tau / f32(max(segments, 2));
  let segment = i32(angle / segAngle);
  let segmentStart = f32(segment) * segAngle;
  var localAngle = angle - segmentStart;
  let halfSeg = segAngle * 0.5;

  if (smoothEdge <= 0.0) {
    if (localAngle > halfSeg) {
      localAngle = segAngle - localAngle;
    }
  } else {
    let t = smoothstep(halfSeg - smoothEdge, halfSeg + smoothEdge, localAngle);
    localAngle = mix(localAngle, segAngle - localAngle, t);
  }

  angle = segmentStart + localAngle;
  return vec2<f32>(cos(angle), sin(angle)) * radius;
}
          `
        );

        const center = `vec2<f32>(${cx}, ${cy})`;
        const p = `(${uv.code} - ${center})`;
        const segI = `max(2, i32(${segmentsF} + 0.5))`;
        setNodeOut(nodeId, 'out', {
          type: 'vec2<f32>',
          code: `(${center} + kaleidoscopeFold(${p}, ${segI}, ${rotation}, ${smoothEdge}))`,
        });
        break;
      }
      case 'quad-warp': {
        const uv = resolveInputVec2(nodeId, 'in');
        if (!uv) break;

        const c00 = `vec2<f32>(${paramSlotExprWired(paramLayout, nodeId, 'quadCorner0X', 0)}, ${paramSlotExprWired(paramLayout, nodeId, 'quadCorner0Y', 0)})`;
        const c10 = `vec2<f32>(${paramSlotExprWired(paramLayout, nodeId, 'quadCorner1X', 0)}, ${paramSlotExprWired(paramLayout, nodeId, 'quadCorner1Y', 0)})`;
        const c01 = `vec2<f32>(${paramSlotExprWired(paramLayout, nodeId, 'quadCorner2X', 0)}, ${paramSlotExprWired(paramLayout, nodeId, 'quadCorner2Y', 0)})`;
        const c11 = `vec2<f32>(${paramSlotExprWired(paramLayout, nodeId, 'quadCorner3X', 0)}, ${paramSlotExprWired(paramLayout, nodeId, 'quadCorner3Y', 0)})`;

        const u = `(${uv.code}).x`;
        const v = `(${uv.code}).y`;
        const out = `( (1.0 - ${u}) * (1.0 - ${v}) * ${c00} + ${u} * (1.0 - ${v}) * ${c10} + (1.0 - ${u}) * ${v} * ${c01} + ${u} * ${v} * ${c11} )`;
        setNodeOut(nodeId, 'out', { type: 'vec2<f32>', code: out });
        break;
      }
      case 'rain-drops': {
        const uvIn = resolveInputVec2(nodeId, 'in');
        if (!uvIn) break;

        const timeLinked = resolveInputF32(nodeId, 'time');
        const timeCode = timeLinked ? timeLinked.code : 'globals.v0.x';

        const scale = paramSlotExprWired(paramLayout, nodeId, 'scale', 0);
        const seed = paramSlotExprWired(paramLayout, nodeId, 'seed', 0);
        const speed = paramSlotExprWired(paramLayout, nodeId, 'speed', 0);
        const layersF = paramSlotExprWired(paramLayout, nodeId, 'layers', 0);
        const sizeVar = paramSlotExprWired(paramLayout, nodeId, 'sizeVariation', 0);
        const qty = paramSlotExprWired(paramLayout, nodeId, 'quantityPerLayer', 0);

        requireHelper(
          'rainDrops',
          `
fn rainN31(p: f32) -> vec3<f32> {
  var p3 = fract(vec3<f32>(p) * vec3<f32>(0.1031, 0.11369, 0.13787));
  p3 = p3 + vec3<f32>(dot(p3, p3.yzx + vec3<f32>(19.19)));
  return fract(vec3<f32>((p3.x + p3.y) * p3.z, (p3.x + p3.z) * p3.y, (p3.y + p3.z) * p3.x));
}

fn rainSawTooth(t: f32) -> f32 {
  return cos(t + cos(t)) + sin(2.0 * t) * 0.2 + sin(4.0 * t) * 0.02;
}

fn rainDeltaSawTooth(t: f32) -> f32 {
  return 0.4 * cos(2.0 * t) + 0.08 * cos(4.0 * t) - (1.0 - sin(t)) * sin(t + cos(t));
}

fn rainGetDrops(uv: vec2<f32>, seedVal: f32, tMove: f32, sizeVariation: f32, quantityPerLayer: f32) -> vec2<f32> {
  var o = vec2<f32>(0.0, 0.0);
  var uvW = uv;
  uvW.y = uvW.y + tMove * 0.05;
  uvW = uvW * vec2<f32>(10.0, 2.5) * 2.0 * quantityPerLayer;
  let id = floor(uvW);
  let n = rainN31(id.x + (id.y + seedVal) * 546.3524);
  let bd0 = fract(uvW);
  var bd = bd0;
  bd = bd - vec2<f32>(0.5, 0.5);
  bd.y = bd.y * 4.0;
  bd.x = bd.x + (n.x - 0.5) * 0.6;
  let tLocal = tMove + n.z * 6.2831853;
  let slide = rainSawTooth(tLocal);
  let ts = 1.5;
  let trailPos = vec2<f32>(bd.x * ts, (fract(bd.y * ts * 2.0 - tLocal * 2.0) - 0.5) * 0.5);
  bd.y = bd.y + slide * 2.0;
  let dropShape = bd.x * bd.x;
  let dShape = rainDeltaSawTooth(tLocal);
  bd.y = bd.y + dropShape * dShape;
  let d = length(bd);
  var trailMask = smoothstep(-0.2, 0.2, bd.y);
  trailMask = trailMask * bd.y;
  let td = length(trailPos * max(0.5, trailMask));
  let sizeMul = max(0.2, 1.0 + sizeVariation * (n.x - 0.5));
  let rOuter = 0.2 * sizeMul;
  let rInner = 0.1 * sizeMul;
  let mainDrop = smoothstep(rOuter, rInner, d);
  let trailOuter = 0.1 * sizeMul;
  let trailInner = 0.02 * sizeMul;
  var dropTrail = smoothstep(trailOuter, trailInner, td);
  dropTrail = dropTrail * trailMask;
  o = mix(bd * mainDrop, trailPos, dropTrail);
  return o;
}
          `
        );

        const layersI = `min(3, max(1, i32(${layersF} + 0.5)))`;
        const tExpr = `(${timeCode} * ${speed})`;
        const uvScaled = `(${uvIn.code} * ${scale})`;
        const o0 = `rainGetDrops(${uvScaled}, ${seed}, ${tExpr}, ${sizeVar}, ${qty})`;
        const o1 = `rainGetDrops(${uvScaled} * 1.4, ${seed} + 10.0, ${tExpr}, ${sizeVar}, ${qty})`;
        const o2 = `rainGetDrops(${uvScaled} * 2.4, ${seed} + 25.0, ${tExpr}, ${sizeVar}, ${qty})`;
        const combined = `(${o0} + select(vec2<f32>(0.0, 0.0), ${o1}, ${layersI} >= 2) + select(vec2<f32>(0.0, 0.0), ${o2}, ${layersI} >= 3))`;

        setNodeOut(nodeId, 'out', { type: 'vec2<f32>', code: combined });
        break;
      }
      case 'ripple': {
        const p = resolveInputVec2(nodeId, 'in');
        if (!p) break;

        const cx = paramSlotExprWired(paramLayout, nodeId, 'rippleCenterX', 0);
        const cy = paramSlotExprWired(paramLayout, nodeId, 'rippleCenterY', 0);
        const modeParam = paramSlotExprWired(paramLayout, nodeId, 'rippleMode', 0);
        const freq = paramSlotExprWired(paramLayout, nodeId, 'rippleFrequency', 0);
        const amp = paramSlotExprWired(paramLayout, nodeId, 'rippleAmplitude', 0);
        const phase = paramSlotExprWired(paramLayout, nodeId, 'ripplePhase', 0);
        const timeSpeed = paramSlotExprWired(paramLayout, nodeId, 'rippleTimeSpeed', 0);
        const timeOffset = paramSlotExprWired(paramLayout, nodeId, 'rippleTimeOffset', 0);

        const center = `vec2<f32>(${cx}, ${cy})`;
        const d = `(${p.code} - ${center})`;
        const dist = `length(${d})`;
        const n = `select(vec2<f32>(1.0, 0.0), normalize(${d}), ${dist} > 0.0001)`;
        const t = `(${phase} + (globals.v0.x * ${timeSpeed} + ${timeOffset}))`;

        // mode is an int in node spec, but parameters are floats in param buffer; treat >0.5 as mode 1.
        const isMode1 = `(${modeParam} > 0.5)`;
        const wave0 = `sin(${dist} * ${freq} + ${t})`;
        const out0 = `(${p.code} + ${n} * (${wave0} * ${amp}))`;
        const dx = `(${amp} * sin((${p.code}).y * ${freq} + ${t}))`;
        const dy = `(${amp} * sin((${p.code}).x * ${freq} + (${t} * 0.7)))`;
        const out1 = `(${p.code} + vec2<f32>(${dx}, ${dy}))`;

        setNodeOut(nodeId, 'out', { type: 'vec2<f32>', code: `select(${out0}, ${out1}, ${isMode1})` });
        break;
      }
      case 'shapes-2d': {
        const pIn = resolveInputVec2(nodeId, 'in');
        if (!pIn) break;

        const shapeTypeF = paramSlotExprWired(paramLayout, nodeId, 'shapeType', 0);
        const sizeX = paramSlotExprWired(paramLayout, nodeId, 'sizeX', 0);
        const sizeY = paramSlotExprWired(paramLayout, nodeId, 'sizeY', 0);
        const centerX = paramSlotExprWired(paramLayout, nodeId, 'centerX', 0);
        const centerY = paramSlotExprWired(paramLayout, nodeId, 'centerY', 0);
        const roundness = paramSlotExprWired(paramLayout, nodeId, 'roundness', 0);
        const rotationDeg = paramSlotExprWired(paramLayout, nodeId, 'rotation', 0);
        const polygonSidesF = paramSlotExprWired(paramLayout, nodeId, 'polygonSides', 0);
        const superPower = paramSlotExprWired(paramLayout, nodeId, 'superPower', 0);
        const softness = paramSlotExprWired(paramLayout, nodeId, 'softness', 0);
        const intensity = paramSlotExprWired(paramLayout, nodeId, 'intensity', 0);

        requireHelper(
          'shapes2d',
          `
fn shapes2d_rotate2D(p: vec2<f32>, angle: f32) -> vec2<f32> {
  let c = cos(angle);
  let s = sin(angle);
  return vec2<f32>(p.x * c - p.y * s, p.x * s + p.y * c);
}

fn shapes2d_sdEllipse(p: vec2<f32>, rx: f32, ry: f32) -> f32 {
  let q = p / vec2<f32>(rx, ry);
  return length(q) - 1.0;
}

fn shapes2d_sdRoundBox(p: vec2<f32>, b: vec2<f32>, r: f32) -> f32 {
  let q = abs(p) - b + vec2<f32>(r, r);
  return min(max(q.x, q.y), 0.0) + length(max(q, vec2<f32>(0.0, 0.0))) - r;
}

fn shapes2d_sdRegularPolygon(p: vec2<f32>, r: f32, n: f32) -> f32 {
  let ang = atan2(p.y, p.x);
  let sector = 6.28318530718 / max(n, 3.0);
  let halfSector = sector * 0.5;
  let k = cos(floor((ang + halfSector) / sector) * sector - ang);
  return length(p) * k - r;
}

fn shapes2d_sdCapsule2D(p: vec2<f32>, halfLen: f32, r: f32) -> f32 {
  let a = vec2<f32>(-halfLen, 0.0);
  let b = vec2<f32>(halfLen, 0.0);
  let pa = p - a;
  let ba = b - a;
  let h = clamp(dot(pa, ba) / max(dot(ba, ba), 0.0001), 0.0, 1.0);
  return length(pa - ba * h) - r;
}

fn shapes2d_superellipseMask(p: vec2<f32>, rx: f32, ry: f32, n: f32) -> f32 {
  let q = abs(p) / vec2<f32>(max(rx, 0.0001), max(ry, 0.0001));
  return pow(q.x, n) + pow(q.y, n);
}

fn shapes2d_eval(
  pos: vec2<f32>,
  shapeType: i32,
  sizeX: f32,
  sizeY: f32,
  roundness: f32,
  rotationDeg: f32,
  polygonSides: i32,
  superPower: f32,
  softness: f32,
  intensity: f32
) -> f32 {
  var p = shapes2d_rotate2D(pos, rotationDeg * 0.017453292519943295);

  if (shapeType == 0) {
    let rx = sizeX * 0.5;
    let ry = sizeY * 0.5;
    let d = shapes2d_sdEllipse(p, rx, ry);
    let halfSoft = softness * 0.5;
    let mask = 1.0 - smoothstep(-halfSoft, halfSoft, d);
    return mask * intensity;
  }

  if (shapeType == 1) {
    let halfSize = vec2<f32>(sizeX * 0.5, sizeY * 0.5);
    let d = shapes2d_sdRoundBox(p, halfSize, roundness);
    let soft = max(softness, 0.0001);
    let mask = 1.0 - smoothstep(0.0, soft, d);
    return mask * intensity;
  }

  if (shapeType == 2) {
    let rx = sizeX * 0.5;
    let ry = sizeY * 0.5;
    let k = shapes2d_superellipseMask(p, rx, ry, superPower);
    let halfSoft = softness * 0.5;
    let mask = 1.0 - smoothstep(1.0 - halfSoft, 1.0 + halfSoft, k);
    return mask * intensity;
  }

  if (shapeType == 3) {
    let rx = max(sizeX * 0.5, 0.0001);
    let ry = max(sizeY * 0.5, 0.0001);
    let q = p / vec2<f32>(rx, ry);
    let sides = clamp(f32(polygonSides), 3.0, 32.0);
    let d = shapes2d_sdRegularPolygon(q, 1.0, sides);
    let halfSoft = softness * 0.5;
    let mask = 1.0 - smoothstep(-halfSoft, halfSoft, d);
    return mask * intensity;
  }

  // capsule
  let halfLen = max(sizeX * 0.25, 0.0);
  let r = max(sizeY * 0.25, 0.0);
  let d = shapes2d_sdCapsule2D(p, halfLen, r);
  let soft = max(softness, 0.0001);
  let mask = 1.0 - smoothstep(0.0, soft, d);
  return mask * intensity;
}
          `
        );

        const center = `vec2<f32>(${centerX}, ${centerY})`;
        const p = `(${pIn.code} - ${center})`;
        const shapeType = `i32(floor(${shapeTypeF} + 0.5))`;
        const polygonSides = `i32(floor(${polygonSidesF} + 0.5))`;
        setNodeOut(nodeId, 'out', {
          type: 'f32',
          code: `shapes2d_eval(${p}, ${shapeType}, ${sizeX}, ${sizeY}, ${roundness}, ${rotationDeg}, ${polygonSides}, ${superPower}, ${softness}, ${intensity})`,
        });
        break;
      }
      case 'star-shape-2d': {
        const pIn = resolveInputVec2(nodeId, 'in');
        if (!pIn) break;

        const styleF = paramSlotExprWired(paramLayout, nodeId, 'style', 0);
        const centerX = paramSlotExprWired(paramLayout, nodeId, 'starCenterX', 0);
        const centerY = paramSlotExprWired(paramLayout, nodeId, 'starCenterY', 0);
        const pointsF = paramSlotExprWired(paramLayout, nodeId, 'starPoints', 0);
        const innerR = paramSlotExprWired(paramLayout, nodeId, 'starInnerRadius', 0);
        const outerR = paramSlotExprWired(paramLayout, nodeId, 'starOuterRadius', 0);
        const roundness = paramSlotExprWired(paramLayout, nodeId, 'starRoundness', 0);
        const rotationDeg = paramSlotExprWired(paramLayout, nodeId, 'starRotation', 0);
        const softness = paramSlotExprWired(paramLayout, nodeId, 'starSoftness', 0);
        const intensity = paramSlotExprWired(paramLayout, nodeId, 'starIntensity', 0);

        requireHelper(
          'starShape2d',
          `
fn star2d_sdSegment(p: vec2<f32>, a: vec2<f32>, b: vec2<f32>) -> f32 {
  let pa = p - a;
  let ba = b - a;
  let h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h);
}

fn star2d_sdStarburst2d(p: vec2<f32>, points: i32, innerR: f32, outerR: f32, roundness01: f32) -> f32 {
  let pi = 3.14159265359;
  let n = f32(points);
  let an = 2.0 * pi / n;
  var angle = atan2(p.y, p.x);
  let r = length(p);

  angle = angle + pi;
  angle = angle - an * floor(angle / an);
  angle = angle - 0.5 * an;

  let q = vec2<f32>(cos(angle), sin(angle)) * r;
  let halfAngle = 0.5 * an;
  let pa = vec2<f32>(innerR * cos(halfAngle), innerR * sin(halfAngle));
  let pb = vec2<f32>(outerR, 0.0);
  var d = star2d_sdSegment(q, pa, pb);
  let roundness = 0.5 * clamp(roundness01, 0.0, 1.0);
  if (roundness > 0.001) { d = d - roundness; }
  return d;
}

fn star2d_starRadius(angleIn: f32, points: i32, innerR: f32, outerR: f32, rotationDeg: f32, roundness: f32) -> f32 {
  let tau = 6.283185307179586;
  var angle = angleIn + rotationDeg * 0.017453292519943295;
  angle = angle + tau;
  angle = angle - tau * floor(angle / tau);
  let k = f32(points);
  var x = angle * k / tau;
  x = fract(x);
  let m = abs(x * 2.0 - 1.0);
  var t = 1.0 - m;
  let exponent = mix(4.0, 1.0, clamp(roundness, 0.0, 1.0));
  t = pow(t, exponent);
  return mix(innerR, outerR, t);
}

fn star2d_sdStarShape2d(p: vec2<f32>, points: i32, innerR: f32, outerR: f32, rotationDeg: f32, roundness: f32) -> f32 {
  let angle = atan2(p.y, p.x);
  let r = length(p);
  let rShape = star2d_starRadius(angle, points, innerR, outerR, rotationDeg, roundness);
  return r - rShape;
}

fn star2d_eval(
  pos: vec2<f32>,
  style: i32,
  points: i32,
  innerR: f32,
  outerR: f32,
  roundness: f32,
  rotationDeg: f32,
  softness: f32,
  intensity: f32
) -> f32 {
  var d: f32 = 0.0;
  if (style == 1) { d = star2d_sdStarburst2d(pos, points, innerR, outerR, roundness); }
  else { d = star2d_sdStarShape2d(pos, points, innerR, outerR, rotationDeg, roundness); }
  let halfSoft = softness * 0.5;
  let mask = 1.0 - smoothstep(-halfSoft, halfSoft, d);
  return mask * intensity;
}
          `
        );

        const center = `vec2<f32>(${centerX}, ${centerY})`;
        const p = `(${pIn.code} - ${center})`;
        const style = `i32(floor(${styleF} + 0.5))`;
        const points = `max(3, i32(floor(${pointsF} + 0.5)))`;
        setNodeOut(nodeId, 'out', {
          type: 'f32',
          code: `star2d_eval(${p}, ${style}, ${points}, ${innerR}, ${outerR}, ${roundness}, ${rotationDeg}, ${softness}, ${intensity})`,
        });
        break;
      }
      case 'turbulence': {
        const uv = resolveInputVec2(nodeId, 'in');
        if (!uv) break;

        const scale = paramSlotExprWired(paramLayout, nodeId, 'turbulenceScale', 0);
        const strengthRaw = paramSlotExprWired(paramLayout, nodeId, 'turbulenceStrength', 0);
        const itersF = paramSlotExprWired(paramLayout, nodeId, 'turbulenceIterations', 0);
        const timeSpeed = paramSlotExprWired(paramLayout, nodeId, 'turbulenceTimeSpeed', 0);
        const timeOffset = paramSlotExprWired(paramLayout, nodeId, 'turbulenceTimeOffset', 0);

        requireHelper(
          'turbulence',
          `
fn noise2D(p: vec2<f32>) -> vec2<f32> {
  return vec2<f32>(
    fract(sin(dot(p, vec2<f32>(12.9898, 78.233))) * 43758.5453),
    fract(sin(dot(p, vec2<f32>(12.9898, 78.233) + vec2<f32>(1.0, 1.0))) * 43758.5453)
  );
}

fn turbulenceWarp(p: vec2<f32>, time: f32, iterations: i32, strength: f32) -> vec2<f32> {
  var q = p;
  let iterCount = max(iterations, 1);
  let s = clamp(strength, 0.0, 2.0) * 0.2;
  let t = vec2<f32>(time, time * 1.37);

  for (var i: i32 = 0; i < 8; i = i + 1) {
    if (i >= iterCount) { break; }
    let sc = pow(2.0, f32(i));
    let safeScale = max(sc, 0.001);
    let offset = noise2D(q * safeScale + t) * 2.0 - vec2<f32>(1.0, 1.0);
    q = q + offset * s / safeScale;
  }
  return q;
}
          `
        );

        const time = `((globals.v0.x + ${timeOffset}) * ${timeSpeed} * ${TURBULENCE_TIME_INTRINSIC_SCALE})`;
        const safeScale = `max(${scale}, 0.001)`;
        const strength = `(clamp(${strengthRaw}, 0.0, 2.0) * ${safeScale})`;
        const itersI = `max(1, i32(${itersF} + 0.5))`;
        setNodeOut(nodeId, 'out', {
          type: 'vec2<f32>',
          code: `(turbulenceWarp(${uv.code} * ${safeScale}, ${time}, ${itersI}, ${strength}) / ${safeScale})`,
        });
        break;
      }
      case 'vector-field': {
        const uv = resolveInputVec2(nodeId, 'in');
        if (!uv) break;

        const fx = paramSlotExprWired(paramLayout, nodeId, 'vectorFieldFrequencyX', 0);
        const fy = paramSlotExprWired(paramLayout, nodeId, 'vectorFieldFrequencyY', 0);
        const amp = paramSlotExprWired(paramLayout, nodeId, 'vectorFieldAmplitude', 0);
        const radialStrength = paramSlotExprWired(paramLayout, nodeId, 'vectorFieldRadialStrength', 0);
        const harmonicAmp = paramSlotExprWired(paramLayout, nodeId, 'vectorFieldHarmonicAmplitude', 0);
        const complexity = paramSlotExprWired(paramLayout, nodeId, 'vectorFieldComplexity', 0);
        const distContrib = paramSlotExprWired(paramLayout, nodeId, 'vectorFieldDistanceContribution', 0);
        const speed = paramSlotExprWired(paramLayout, nodeId, 'vectorFieldSpeed', 0);
        const animSpeed = paramSlotExprWired(paramLayout, nodeId, 'animationSpeed', 0);

        requireHelper(
          'vectorField',
          `
fn vectorFieldDistortion(
  p: vec2<f32>,
  time: f32,
  frequencies: vec2<f32>,
  radialStrength: f32,
  amplitude: f32,
  complexity: f32,
  harmonicAmp: f32,
  distContrib: f32
) -> vec2<f32> {
  let d = length(p);
  var a = normalize(cos(frequencies + vec2<f32>(time, time) - d * radialStrength));
  let perpendicular = vec2<f32>(-a.y, a.x);
  a = a * dot(a, p) - perpendicular * amplitude;

  let c = clamp(complexity, 1.0, 15.0);
  for (var j: f32 = 1.0; j < 15.0; j = j + 1.0) {
    if (j >= c) { break; }
    a = a + (sin(a * j + vec2<f32>(time, time)).yx / j) * harmonicAmp;
  }

  return a * distContrib;
}
          `
        );

        const time = `(globals.v0.x * ${animSpeed} * ${speed})`;
        const freqs = `vec2<f32>(${fx}, ${fy})`;
        setNodeOut(nodeId, 'out', {
          type: 'vec2<f32>',
          code: `(${uv.code} + vectorFieldDistortion(${uv.code}, ${time}, ${freqs}, ${radialStrength}, ${amp}, ${complexity}, ${harmonicAmp}, ${distContrib}) * 0.1)`,
        });
        break;
      }
      case 'vortex': {
        const uv = resolveInputVec2(nodeId, 'in');
        if (!uv) break;

        const cx = paramSlotExprWired(paramLayout, nodeId, 'vortexCenterX', 0);
        const cy = paramSlotExprWired(paramLayout, nodeId, 'vortexCenterY', 0);
        const strength = paramSlotExprWired(paramLayout, nodeId, 'vortexStrength', 0);
        const radius = paramSlotExprWired(paramLayout, nodeId, 'vortexRadius', 0);
        const falloff = paramSlotExprWired(paramLayout, nodeId, 'vortexFalloff', 0);
        const timeSpeed = paramSlotExprWired(paramLayout, nodeId, 'vortexTimeSpeed', 0);
        const radialPull = paramSlotExprWired(paramLayout, nodeId, 'vortexRadialPull', 0);

        requireHelper(
          'vortex',
          `
fn vortex(p: vec2<f32>, center: vec2<f32>, strength: f32, radius: f32, falloff: f32, time: f32, radialPull: f32) -> vec2<f32> {
  let d = p - center;
  let dist = length(d);
  if (dist < 0.0001) { return p; }
  let n = dist / max(radius, 0.001);
  let f = pow(1.0 - smoothstep(0.0, 1.0, n), falloff);
  var angle = atan2(d.y, d.x);
  angle = angle + strength * f + time;
  let r = dist * (1.0 - radialPull * 0.3 * f * abs(strength));
  return center + vec2<f32>(cos(angle), sin(angle)) * r;
}
          `
        );

        const center = `vec2<f32>(${cx}, ${cy})`;
        const time = `(globals.v0.x * ${timeSpeed})`;
        setNodeOut(nodeId, 'out', { type: 'vec2<f32>', code: `vortex(${uv.code}, ${center}, ${strength}, ${radius}, ${falloff}, ${time}, ${radialPull})` });
        break;
      }
      case 'add': {
        const a = resolveInputF32(nodeId, 'a');
        const b = resolveInputF32(nodeId, 'b', 'b');
        if (!a || !b) break;
        setNodeOut(nodeId, 'out', { type: 'f32', code: `(${a.code} + ${b.code})` });
        break;
      }
      case 'subtract': {
        const a = resolveInputF32(nodeId, 'a');
        const b = resolveInputF32(nodeId, 'b', 'b');
        if (!a || !b) break;
        setNodeOut(nodeId, 'out', { type: 'f32', code: `(${a.code} - ${b.code})` });
        break;
      }
      case 'multiply': {
        const a = resolveInputF32(nodeId, 'a');
        const b = resolveInputF32(nodeId, 'b', 'b');
        if (!a || !b) break;
        setNodeOut(nodeId, 'out', { type: 'f32', code: `(${a.code} * ${b.code})` });
        break;
      }
      case 'divide': {
        const a = resolveInputF32(nodeId, 'a');
        const b = resolveInputF32(nodeId, 'b', 'b');
        if (!a || !b) break;
        setNodeOut(nodeId, 'out', { type: 'f32', code: `(${a.code} / ${b.code})` });
        break;
      }
      case 'power': {
        const base = resolveInput(nodeId, 'base');
        const expn = resolveInput(nodeId, 'exponent', 'exponent');
        if (!base || !expn) break;
        setNodeOut(nodeId, 'out', {
          type: promoteType(base.type, expn.type),
          code: `pow(${base.code}, ${expn.code})`,
        });
        break;
      }
      case 'square-root': {
        const x = resolveInput(nodeId, 'in');
        if (!x) break;
        setNodeOut(nodeId, 'out', { type: x.type, code: `sqrt(${x.code})` });
        break;
      }
      case 'modulo': {
        const a = resolveInput(nodeId, 'a');
        const b = resolveInput(nodeId, 'b', 'b');
        if (!a || !b) break;
        // WGSL has `%` for integers only; implement float modulo via a - b * floor(a / b).
        // This mirrors GLSL `mod(a, b)` for positive/negative values reasonably well.
        setNodeOut(nodeId, 'out', {
          type: promoteType(a.type, b.type),
          code: `(${a.code} - ${b.code} * floor(${a.code} / ${b.code}))`,
        });
        break;
      }
      case 'mix': {
        const a = resolveInput(nodeId, 'a', 'a');
        const b = resolveInput(nodeId, 'b', 'b');
        const t = resolveInput(nodeId, 't', 't');
        if (!a || !b || !t) break;
        setNodeOut(nodeId, 'out', {
          type: promoteType(a.type, b.type),
          code: `mix(${a.code}, ${b.code}, ${t.code})`,
        });
        break;
      }
      case 'mixed-wave-signal': {
        requireHelper(
          'mixedWaveSignal',
          `
fn mwsMixedWaveShape(p: f32, shape: i32) -> f32 {
  let twoPi = 6.28318530718;
  let pi = 3.14159265359;
  let sh = clamp(shape, 0, 7);
  if (sh == 0) { return sin(p); }
  if (sh == 1) { return cos(p); }
  if (sh == 2) { return sign(sin(p)); }
  if (sh == 3) { return asin(sin(p)) * (2.0 / pi); }
  if (sh == 4) { return 2.0 * fract(p / twoPi) - 1.0; }
  if (sh == 5) { return 1.0 - 2.0 * fract(p / twoPi); }
  if (sh == 6) { return 2.0 * abs(sin(p)) - 1.0; }
  if (sh == 7) { return smoothstep(-0.999, 0.999, sin(p)) * 2.0 - 1.0; }
  return sin(p);
}
          `
        );

        const gSpeed = paramSlotExprWired(paramLayout, nodeId, 'globalSpeed', 0);
        const gOff = paramSlotExprWired(paramLayout, nodeId, 'globalOffset', 0);
        const w0s = paramSlotExprWired(paramLayout, nodeId, 'w0Speed', 0);
        const w0o = paramSlotExprWired(paramLayout, nodeId, 'w0Offset', 0);
        const w0w = paramSlotExprWired(paramLayout, nodeId, 'w0Weight', 0);
        const w0shF = paramSlotExprWired(paramLayout, nodeId, 'w0Shape', 0);
        const w1s = paramSlotExprWired(paramLayout, nodeId, 'w1Speed', 0);
        const w1o = paramSlotExprWired(paramLayout, nodeId, 'w1Offset', 0);
        const w1w = paramSlotExprWired(paramLayout, nodeId, 'w1Weight', 0);
        const w1shF = paramSlotExprWired(paramLayout, nodeId, 'w1Shape', 0);
        const w2s = paramSlotExprWired(paramLayout, nodeId, 'w2Speed', 0);
        const w2o = paramSlotExprWired(paramLayout, nodeId, 'w2Offset', 0);
        const w2w = paramSlotExprWired(paramLayout, nodeId, 'w2Weight', 0);
        const w2shF = paramSlotExprWired(paramLayout, nodeId, 'w2Shape', 0);
        const outMin = paramSlotExprWired(paramLayout, nodeId, 'outMin', 0);
        const outMax = paramSlotExprWired(paramLayout, nodeId, 'outMax', 0);

        const tBase = `(globals.v0.x * ${gSpeed} + ${gOff})`;
        const w0sh = `i32(floor(${w0shF} + 0.5))`;
        const w1sh = `i32(floor(${w1shF} + 0.5))`;
        const w2sh = `i32(floor(${w2shF} + 0.5))`;
        const p0 = `(${tBase} * ${w0s} + ${w0o})`;
        const p1 = `(${tBase} * ${w1s} + ${w1o})`;
        const p2 = `(${tBase} * ${w2s} + ${w2o})`;
        const s0 = `mwsMixedWaveShape(${p0}, ${w0sh})`;
        const s1 = `mwsMixedWaveShape(${p1}, ${w1sh})`;
        const s2 = `mwsMixedWaveShape(${p2}, ${w2sh})`;
        const wsum = `(${w0w} + ${w1w} + ${w2w} + 1e-6)`;
        const combined = `((${w0w} * ${s0} + ${w1w} * ${s1} + ${w2w} * ${s2}) / ${wsum})`;
        const u = `(${combined} * 0.5 + 0.5)`;
        const out = `(${outMin} + ${u} * (${outMax} - ${outMin}))`;

        setNodeOut(nodeId, 'out', { type: 'f32', code: out });
        break;
      }
      case 'clamp': {
        const v = resolveInput(nodeId, 'in');
        const mn = resolveInput(nodeId, 'min', 'min');
        const mx = resolveInput(nodeId, 'max', 'max');
        if (!v || !mn || !mx) break;
        setNodeOut(nodeId, 'out', { type: v.type, code: `clamp(${v.code}, ${mn.code}, ${mx.code})` });
        break;
      }
      case 'step': {
        const edge = resolveInput(nodeId, 'edge', 'edge');
        const x = resolveInput(nodeId, 'x', 'x');
        if (!edge || !x) break;
        setNodeOut(nodeId, 'out', { type: promoteType(edge.type, x.type), code: `step(${edge.code}, ${x.code})` });
        break;
      }
      case 'smoothstep': {
        const edge0 = resolveInput(nodeId, 'edge0', 'edge0');
        const edge1 = resolveInput(nodeId, 'edge1', 'edge1');
        const x = resolveInput(nodeId, 'x', 'x');
        if (!edge0 || !edge1 || !x) break;
        setNodeOut(nodeId, 'out', {
          type: promoteType(promoteType(edge0.type, edge1.type), x.type),
          code: `smoothstep(${edge0.code}, ${edge1.code}, ${x.code})`,
        });
        break;
      }
      case 'min': {
        const a = resolveInput(nodeId, 'a');
        const b = resolveInput(nodeId, 'b', 'b');
        if (!a || !b) break;
        setNodeOut(nodeId, 'out', { type: promoteType(a.type, b.type), code: `min(${a.code}, ${b.code})` });
        break;
      }
      case 'max': {
        const a = resolveInput(nodeId, 'a');
        const b = resolveInput(nodeId, 'b', 'b');
        if (!a || !b) break;
        setNodeOut(nodeId, 'out', { type: promoteType(a.type, b.type), code: `max(${a.code}, ${b.code})` });
        break;
      }
      case 'fract': {
        const x = resolveInput(nodeId, 'in', 'in');
        if (!x) break;
        setNodeOut(nodeId, 'out', { type: x.type, code: `fract(${x.code})` });
        break;
      }
      case 'absolute': {
        const x = resolveInput(nodeId, 'in', 'in');
        if (!x) break;
        setNodeOut(nodeId, 'out', { type: x.type, code: `abs(${x.code})` });
        break;
      }
      case 'sine': {
        const x = resolveInput(nodeId, 'in', 'in');
        if (!x) break;
        setNodeOut(nodeId, 'out', { type: x.type, code: `sin(${x.code})` });
        break;
      }
      case 'cosine': {
        const x = resolveInput(nodeId, 'in', 'in');
        if (!x) break;
        setNodeOut(nodeId, 'out', { type: x.type, code: `cos(${x.code})` });
        break;
      }
      case 'tangent': {
        const x = resolveInput(nodeId, 'in', 'in');
        if (!x) break;
        setNodeOut(nodeId, 'out', { type: x.type, code: `tan(${x.code})` });
        break;
      }
      case 'arc-sine': {
        const x = resolveInput(nodeId, 'in', 'in');
        if (!x) break;
        setNodeOut(nodeId, 'out', { type: x.type, code: `asin(${x.code})` });
        break;
      }
      case 'arc-cosine': {
        const x = resolveInput(nodeId, 'in', 'in');
        if (!x) break;
        setNodeOut(nodeId, 'out', { type: x.type, code: `acos(${x.code})` });
        break;
      }
      case 'arc-tangent': {
        const x = resolveInput(nodeId, 'in', 'in');
        if (!x) break;
        setNodeOut(nodeId, 'out', { type: x.type, code: `atan(${x.code})` });
        break;
      }
      case 'arc-tangent-2': {
        const y = resolveInput(nodeId, 'y', 'y');
        const x = resolveInput(nodeId, 'x', 'x');
        if (!y || !x) break;
        setNodeOut(nodeId, 'out', { type: promoteType(y.type, x.type), code: `atan2(${y.code}, ${x.code})` });
        break;
      }
      case 'exponential': {
        const x = resolveInput(nodeId, 'in', 'in');
        if (!x) break;
        setNodeOut(nodeId, 'out', { type: x.type, code: `exp(${x.code})` });
        break;
      }
      case 'natural-logarithm': {
        const x = resolveInput(nodeId, 'in', 'in');
        if (!x) break;
        setNodeOut(nodeId, 'out', { type: x.type, code: `log(${x.code})` });
        break;
      }
      case 'lerp': {
        // Alias for mix, but exists as its own node for ergonomics.
        const a = resolveInput(nodeId, 'a', 'a');
        const b = resolveInput(nodeId, 'b', 'b');
        const t = resolveInput(nodeId, 't', 't');
        if (!a || !b || !t) break;
        setNodeOut(nodeId, 'out', {
          type: promoteType(a.type, b.type),
          code: `mix(${a.code}, ${b.code}, ${t.code})`,
        });
        break;
      }
      case 'saturate': {
        const x = resolveInput(nodeId, 'in', 'in');
        if (!x) break;
        setNodeOut(nodeId, 'out', { type: x.type, code: `clamp(${x.code}, 0.0, 1.0)` });
        break;
      }
      case 'clamp-01': {
        const x = resolveInput(nodeId, 'in', 'in');
        if (!x) break;
        setNodeOut(nodeId, 'out', { type: x.type, code: `clamp(${x.code}, 0.0, 1.0)` });
        break;
      }
      case 'one-minus': {
        const x = resolveInput(nodeId, 'in', 'in');
        if (!x) break;
        setNodeOut(nodeId, 'out', { type: x.type, code: `(1.0 - ${x.code})` });
        break;
      }
      case 'negate': {
        const x = resolveInput(nodeId, 'in', 'in');
        if (!x) break;
        setNodeOut(nodeId, 'out', { type: x.type, code: `(-${x.code})` });
        break;
      }
      case 'dot-product': {
        const a = resolveInputVec2(nodeId, 'a');
        const b = resolveInputVec2(nodeId, 'b');
        if (!a || !b) break;
        setNodeOut(nodeId, 'out', { type: 'f32', code: `dot(${a.code}, ${b.code})` });
        break;
      }
      case 'cross-product': {
        const a = resolveInputVec3(nodeId, 'a');
        const b = resolveInputVec3(nodeId, 'b');
        if (!a || !b) break;
        setNodeOut(nodeId, 'out', { type: 'vec3<f32>', code: `cross(${a.code}, ${b.code})` });
        break;
      }
      case 'length': {
        const v = resolveInputVec2(nodeId, 'in');
        if (!v) break;
        setNodeOut(nodeId, 'out', { type: 'f32', code: `length(${v.code})` });
        break;
      }
      case 'normalize': {
        const v = resolveInputVec2(nodeId, 'in');
        if (!v) break;
        setNodeOut(nodeId, 'out', { type: 'vec2<f32>', code: `normalize(${v.code})` });
        break;
      }
      case 'distance': {
        const a = resolveInputVec2(nodeId, 'a');
        const b = resolveInputVec2(nodeId, 'b', ['bX', 'bY']);
        if (!a || !b) break;
        setNodeOut(nodeId, 'out', { type: 'f32', code: `distance(${a.code}, ${b.code})` });
        break;
      }
      case 'reciprocal': {
        const x = resolveInput(nodeId, 'in', 'in');
        if (!x) break;
        setNodeOut(nodeId, 'out', { type: x.type, code: `(1.0 / ${x.code})` });
        break;
      }
      case 'sign': {
        const x = resolveInput(nodeId, 'in', 'in');
        if (!x) break;
        setNodeOut(nodeId, 'out', { type: x.type, code: `sign(${x.code})` });
        break;
      }
      case 'floor': {
        const x = resolveInputF32(nodeId, 'in', 'in');
        if (!x) break;
        setNodeOut(nodeId, 'out', { type: x.type, code: `floor(${x.code})` });
        break;
      }
      case 'ceil': {
        const x = resolveInputF32(nodeId, 'in', 'in');
        if (!x) break;
        setNodeOut(nodeId, 'out', { type: x.type, code: `ceil(${x.code})` });
        break;
      }
      case 'round': {
        const x = resolveInputF32(nodeId, 'in', 'in');
        if (!x) break;
        setNodeOut(nodeId, 'out', { type: x.type, code: `round(${x.code})` });
        break;
      }
      case 'truncate': {
        const x = resolveInputF32(nodeId, 'in', 'in');
        if (!x) break;
        // WGSL uses `trunc()` for truncation.
        setNodeOut(nodeId, 'out', { type: x.type, code: `trunc(${x.code})` });
        break;
      }
      case 'compare': {
        const a = resolveInput(nodeId, 'a');
        const b = resolveInput(nodeId, 'b', 'b');
        if (!a || !b) break;
        if (a.type !== 'f32' || b.type !== 'f32') break;

        const op = paramSlotExprWired(paramLayout, nodeId, 'operation', 0);
        const isOp = (idx: number): string => `(${op} >= ${idx - 0.5} && ${op} < ${idx + 0.5})`;

        const rEq = `select(0.0, 1.0, (${a.code} == ${b.code}))`;
        const rNe = `select(0.0, 1.0, (${a.code} != ${b.code}))`;
        const rLt = `select(0.0, 1.0, (${a.code} < ${b.code}))`;
        const rLe = `select(0.0, 1.0, (${a.code} <= ${b.code}))`;
        const rGt = `select(0.0, 1.0, (${a.code} > ${b.code}))`;
        const rGe = `select(0.0, 1.0, (${a.code} >= ${b.code}))`;

        const out = `(
          ${rEq} * select(0.0, 1.0, ${isOp(0)}) +
          ${rNe} * select(0.0, 1.0, ${isOp(1)}) +
          ${rLt} * select(0.0, 1.0, ${isOp(2)}) +
          ${rLe} * select(0.0, 1.0, ${isOp(3)}) +
          ${rGt} * select(0.0, 1.0, ${isOp(4)}) +
          ${rGe} * select(0.0, 1.0, (${op} >= 4.5))
        )`;

        setNodeOut(nodeId, 'out', { type: 'f32', code: out.replaceAll('\n', ' ') });
        break;
      }
      case 'select': {
        const cond = resolveInput(nodeId, 'condition', 'condition') ?? { type: 'f32', code: '0.0' };
        const t = resolveInput(nodeId, 'trueValue');
        const f = resolveInput(nodeId, 'falseValue');
        if (!t || !f) break;

        const outType = promoteType(t.type, f.type);
        const tt = coerceToType(t, outType);
        const ff = coerceToType(f, outType);
        if (!tt || !ff) break;

        setNodeOut(nodeId, 'out', {
          type: outType,
          code: `select(${ff.code}, ${tt.code}, (${cond.code} > 0.5))`,
        });
        break;
      }
      case 'mask-composite-float': {
        const bg = resolveInput(nodeId, 'bg', 'bg');
        const mask = resolveInputF32(nodeId, 'mask', 'mask');
        const fg = resolveInput(nodeId, 'fg', 'fg');
        if (!bg || !mask || !fg) break;
        if (bg.type !== 'f32' || mask.type !== 'f32' || fg.type !== 'f32') break;
        const invert = paramSlotExprWired(paramLayout, nodeId, 'invert', 0);
        const m = `select(${mask.code}, (1.0 - ${mask.code}), ${invert} > 0.5)`;
        setNodeOut(nodeId, 'out', { type: 'f32', code: `mix(${bg.code}, ${fg.code}, ${m})` });
        break;
      }
      case 'mask-composite-vec2': {
        const bg = resolveInputVec2(nodeId, 'bg');
        const fg = resolveInputVec2(nodeId, 'fg');
        const mask = resolveInputF32(nodeId, 'mask', 'mask');
        if (!bg || !fg || !mask) break;
        if (mask.type !== 'f32') break;
        const invert = paramSlotExprWired(paramLayout, nodeId, 'invert', 0);
        const m = `select(${mask.code}, (1.0 - ${mask.code}), ${invert} > 0.5)`;
        setNodeOut(nodeId, 'out', { type: 'vec2<f32>', code: `mix(${bg.code}, ${fg.code}, ${m})` });
        break;
      }
      case 'mask-composite-vec3': {
        const bg = resolveInputVec3(nodeId, 'bg');
        const fg = resolveInputVec3(nodeId, 'fg');
        const mask = resolveInputF32(nodeId, 'mask', 'mask');
        if (!bg || !fg || !mask) break;
        if (mask.type !== 'f32') break;
        const invert = paramSlotExprWired(paramLayout, nodeId, 'invert', 0);
        const m = `select(${mask.code}, (1.0 - ${mask.code}), ${invert} > 0.5)`;
        setNodeOut(nodeId, 'out', { type: 'vec3<f32>', code: `mix(${bg.code}, ${fg.code}, ${m})` });
        break;
      }
      case 'reflect': {
        const I = resolveInputVec2(nodeId, 'I');
        const N = resolveInputVec2(nodeId, 'N');
        if (!I || !N) break;
        setNodeOut(nodeId, 'out', { type: 'vec2<f32>', code: `reflect(${I.code}, ${N.code})` });
        break;
      }
      case 'refract': {
        const I = resolveInputVec2(nodeId, 'I');
        const N = resolveInputVec2(nodeId, 'N');
        const eta = resolveInput(nodeId, 'eta', 'eta');
        if (!I || !N || !eta) break;
        if (eta.type !== 'f32') break;
        setNodeOut(nodeId, 'out', { type: 'vec2<f32>', code: `refract(${I.code}, ${N.code}, ${eta.code})` });
        break;
      }
      case 'hash32': {
        const p =
          resolveInputVec2(nodeId, 'in') ??
          (() => {
            const s = resolveInputF32(nodeId, 'in');
            if (!s) return null;
            return { type: 'vec2<f32>', code: `vec2<f32>(${s.code}, ${s.code})` } satisfies Expr;
          })();
        if (!p) break;
        requireHelper(
          'hash32',
          `
fn hash32(p: vec2<f32>) -> vec3<f32> {
  var p3 = fract(vec3<f32>(p.x, p.y, p.x) * vec3<f32>(0.1031, 0.1030, 0.0973));
  p3 = p3 + vec3<f32>(dot(p3, p3.yxz + vec3<f32>(19.19)));
  return fract((p3.xxy + p3.yzz) * p3.zyx);
}
          `
        );
        setNodeOut(nodeId, 'out', { type: 'vec3<f32>', code: `hash32(${p.code})` });
        break;
      }
      case 'gradient': {
        const p = resolveInputVec2(nodeId, 'in');
        if (!p) break;

        const gradientType = paramSlotExprWired(paramLayout, nodeId, 'gradientType', 0);
        const cx = paramSlotExprWired(paramLayout, nodeId, 'centerX', 0);
        const cy = paramSlotExprWired(paramLayout, nodeId, 'centerY', 0);
        const radius = paramSlotExprWired(paramLayout, nodeId, 'radius', 0);
        const falloff = paramSlotExprWired(paramLayout, nodeId, 'falloff', 0);
        const invert = paramSlotExprWired(paramLayout, nodeId, 'invert', 0);
        const angleDeg = paramSlotExprWired(paramLayout, nodeId, 'angle', 0);
        const linearScale = paramSlotExprWired(paramLayout, nodeId, 'linearScale', 0);
        const intensity = paramSlotExprWired(paramLayout, nodeId, 'intensity', 0);

        requireHelper(
          'gradient',
          `
fn gradientRadial(p: vec2<f32>, center: vec2<f32>, radius: f32, falloff: f32) -> f32 {
  let d = length(p - center);
  let edge0 = max(0.0, radius - falloff);
  let edge1 = radius;
  return 1.0 - smoothstep(edge0, edge1, d);
}

fn gradientLinear(p: vec2<f32>, angleDeg: f32, scale: f32) -> f32 {
  let angleRad = angleDeg * 0.017453292519943295;
  let dir = vec2<f32>(cos(angleRad), sin(angleRad));
  let t = dot(p, dir) * scale + 0.5;
  return clamp(t, 0.0, 1.0);
}
          `
        );

        const center = `vec2<f32>(${cx}, ${cy})`;
        const radial = `gradientRadial(${p.code}, ${center}, ${radius}, ${falloff})`;
        const linear = `gradientLinear(${p.code}, ${angleDeg}, ${linearScale})`;

        // gradientType is an int param, but lives in float param buffer; treat <0.5 as radial.
        const g0 = `select(${linear}, ${radial}, ${gradientType} < 0.5)`;
        const g1 = `select(${g0}, (1.0 - ${g0}), ${invert} > 0.5)`;

        setNodeOut(nodeId, 'out', { type: 'f32', code: `(${g1} * ${intensity})` });
        break;
      }
      case 'noise': {
        const uvIn = resolveInputVec2(nodeId, 'in');
        if (!uvIn) break;

        const noiseMode = paramSlotExprWired(paramLayout, nodeId, 'noiseMode', 0);
        const noiseScale = paramSlotExprWired(paramLayout, nodeId, 'noiseScale', 0);
        const noiseOctaves = paramSlotExprWired(paramLayout, nodeId, 'noiseOctaves', 0);
        const noiseLacunarity = paramSlotExprWired(paramLayout, nodeId, 'noiseLacunarity', 0);
        const noiseGain = paramSlotExprWired(paramLayout, nodeId, 'noiseGain', 0);
        const noiseTimeSpeed = paramSlotExprWired(paramLayout, nodeId, 'noiseTimeSpeed', 0);
        const noiseTimeOffset = paramSlotExprWired(paramLayout, nodeId, 'noiseTimeOffset', 0);
        const noiseIntensity = paramSlotExprWired(paramLayout, nodeId, 'noiseIntensity', 0);

        requireHelper(
          'noise',
          `
fn noise_hash(n: f32) -> f32 {
  return fract(sin(n) * 43758.5453);
}

fn noise_hash3(v: vec3<f32>) -> vec3<f32> {
  let p = vec3<f32>(
    dot(v, vec3<f32>(127.1, 311.7, 74.7)),
    dot(v, vec3<f32>(269.5, 183.3, 246.1)),
    dot(v, vec3<f32>(113.5, 271.9, 124.6))
  );
  return fract(sin(p) * 43758.5453);
}

// ----- Simplex 2D -----
fn noise_simplex2d(v: vec2<f32>, time: f32) -> f32 {
  let C = vec4<f32>(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  var i = floor(v + dot(v, C.yy));
  let x0 = v - i + dot(i, C.xx);
  let i1 = select(vec2<f32>(0.0, 1.0), vec2<f32>(1.0, 0.0), x0.x > x0.y);
  var x12 = vec4<f32>(x0.x, x0.y, x0.x, x0.y) + C.xxzz;
  x12.x = x12.x - i1.x;
  x12.y = x12.y - i1.y;
  i = i - 289.0 * floor(i / 289.0);

  var p = noise_hash3(vec3<f32>(i.x, i.y, time));
  p = p - 289.0 * floor(p / 289.0);
  var m = max(0.5 - vec3<f32>(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), vec3<f32>(0.0));
  m = m * m;
  m = m * m;
  let x = 2.0 * fract(p * C.www) - 1.0;
  let h = abs(x) - 0.5;
  let ox = floor(x + 0.5);
  let a0 = x - ox;
  m = m * (1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h));

  var g = vec3<f32>(0.0);
  g.x = a0.x * x0.x + h.x * x0.y;
  g.y = a0.y * x12.x + h.y * x12.y;
  g.z = a0.z * x12.z + h.z * x12.w;
  return 130.0 * dot(m, g);
}

fn noise_simplex2d_fbm(p: vec2<f32>, time: f32, octaves: i32, lacunarity: f32, gain: f32) -> f32 {
  var value = 0.0;
  var amplitude = 0.5;
  var frequency = 1.0;
  for (var i = 0; i < 10; i = i + 1) {
    if (i >= octaves) { break; }
    let octaveTime = time * (0.5 + f32(i) * 0.2);
    value = value + amplitude * noise_simplex2d(p * frequency + vec2<f32>(octaveTime * 0.1, octaveTime * 0.15), octaveTime);
    frequency = frequency * lacunarity;
    amplitude = amplitude * gain;
  }
  return value;
}

// ----- Simplex 3D -----
fn noise_mod289_3d3(x: vec3<f32>) -> vec3<f32> {
  return x - floor(x * (1.0 / 289.0)) * 289.0;
}

fn noise_mod289_3d4(x: vec4<f32>) -> vec4<f32> {
  return x - floor(x * (1.0 / 289.0)) * 289.0;
}

fn noise_permute_3d(x: vec4<f32>) -> vec4<f32> {
  return noise_mod289_3d4(((x * 34.0) + 1.0) * x);
}

fn noise_taylorInvSqrt_3d(r: vec4<f32>) -> vec4<f32> {
  return 1.79284291400159 - 0.85373472095314 * r;
}

fn noise_simplex3d(v: vec3<f32>) -> f32 {
  let C = vec2<f32>(1.0 / 6.0, 1.0 / 3.0);
  let D = vec4<f32>(0.0, 0.5, 1.0, 2.0);

  var i = floor(v + dot(v, C.yyy));
  let x0 = v - i + dot(i, C.xxx);

  let g = step(x0.yzx, x0.xyz);
  let l = 1.0 - g;
  let i1 = min(g.xyz, l.zxy);
  let i2 = max(g.xyz, l.zxy);

  let x1 = x0 - i1 + C.xxx;
  let x2 = x0 - i2 + C.yyy;
  let x3 = x0 - D.yyy;

  i = noise_mod289_3d3(i);

  let p = noise_permute_3d(
    noise_permute_3d(
      noise_permute_3d(i.z + vec4<f32>(0.0, i1.z, i2.z, 1.0)) +
      i.y + vec4<f32>(0.0, i1.y, i2.y, 1.0)
    ) +
    i.x + vec4<f32>(0.0, i1.x, i2.x, 1.0)
  );

  let n_ = 0.142857142857;
  let ns = n_ * D.wyz - D.xzx;

  let j = p - 49.0 * floor(p * ns.z * ns.z);
  let x_ = floor(j * ns.z);
  let y_ = floor(j - 7.0 * x_);

  let x = x_ * ns.x + ns.yyyy;
  let y = y_ * ns.x + ns.yyyy;
  let h = 1.0 - abs(x) - abs(y);

  let b0 = vec4<f32>(x.xy, y.xy);
  let b1 = vec4<f32>(x.zw, y.zw);

  let s0 = floor(b0) * 2.0 + 1.0;
  let s1 = floor(b1) * 2.0 + 1.0;
  let sh = -step(h, vec4<f32>(0.0));

  let a0 = vec4<f32>(b0.x, b0.z, b0.y, b0.w) + vec4<f32>(s0.x, s0.z, s0.y, s0.w) * vec4<f32>(sh.x, sh.x, sh.y, sh.y);
  let a1 = vec4<f32>(b1.x, b1.z, b1.y, b1.w) + vec4<f32>(s1.x, s1.z, s1.y, s1.w) * vec4<f32>(sh.z, sh.z, sh.w, sh.w);

  var p0 = vec3<f32>(a0.x, a0.y, h.x);
  var p1 = vec3<f32>(a0.z, a0.w, h.y);
  var p2 = vec3<f32>(a1.x, a1.y, h.z);
  var p3 = vec3<f32>(a1.z, a1.w, h.w);

  let norm = noise_taylorInvSqrt_3d(vec4<f32>(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 = p0 * norm.x;
  p1 = p1 * norm.y;
  p2 = p2 * norm.z;
  p3 = p3 * norm.w;

  var m = max(0.6 - vec4<f32>(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), vec4<f32>(0.0));
  m = m * m;
  return 42.0 * dot(m * m, vec4<f32>(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}

fn noise_simplex3d_fbm(p: vec3<f32>, octaves: i32, lacunarity: f32, gain: f32) -> f32 {
  var value = 0.0;
  var amplitude = 0.5;
  var frequency = 1.0;
  for (var i = 0; i < 10; i = i + 1) {
    if (i >= octaves) { break; }
    value = value + amplitude * noise_simplex3d(p * frequency);
    frequency = frequency * lacunarity;
    amplitude = amplitude * gain;
  }
  return value;
}

// ----- Value fBm -----
fn noise_hash11(n: f32) -> f32 {
  return fract(sin(n) * 43758.5453);
}

fn noise_vnoise(p: vec3<f32>) -> f32 {
  let ip = floor(p);
  let fp = fract(p);
  let n000 = noise_hash11(dot(ip + vec3<f32>(0.0, 0.0, 0.0), vec3<f32>(1.0, 57.0, 113.0)));
  let n100 = noise_hash11(dot(ip + vec3<f32>(1.0, 0.0, 0.0), vec3<f32>(1.0, 57.0, 113.0)));
  let n010 = noise_hash11(dot(ip + vec3<f32>(0.0, 1.0, 0.0), vec3<f32>(1.0, 57.0, 113.0)));
  let n110 = noise_hash11(dot(ip + vec3<f32>(1.0, 1.0, 0.0), vec3<f32>(1.0, 57.0, 113.0)));
  let n001 = noise_hash11(dot(ip + vec3<f32>(0.0, 0.0, 1.0), vec3<f32>(1.0, 57.0, 113.0)));
  let n101 = noise_hash11(dot(ip + vec3<f32>(1.0, 0.0, 1.0), vec3<f32>(1.0, 57.0, 113.0)));
  let n011 = noise_hash11(dot(ip + vec3<f32>(0.0, 1.0, 1.0), vec3<f32>(1.0, 57.0, 113.0)));
  let n111 = noise_hash11(dot(ip + vec3<f32>(1.0, 1.0, 1.0), vec3<f32>(1.0, 57.0, 113.0)));
  let w = fp * fp * fp * (fp * (fp * 6.0 - 15.0) + 10.0);
  let x00 = mix(n000, n100, w.x);
  let x10 = mix(n010, n110, w.x);
  let x01 = mix(n001, n101, w.x);
  let x11 = mix(n011, n111, w.x);
  let y0 = mix(x00, x10, w.y);
  let y1 = mix(x01, x11, w.y);
  return mix(y0, y1, w.z) * 2.0 - 1.0;
}

fn noise_value_fbm(uv: vec2<f32>, t: f32, scale: f32, octaves: i32, lacunarity: f32, gain: f32) -> f32 {
  let p = vec3<f32>(uv * scale, t);
  var amp = 1.0;
  var freq = 1.0;
  var sum = 0.0;
  for (var i = 0; i < 10; i = i + 1) {
    if (i >= octaves) { break; }
    sum = sum + amp * noise_vnoise(p * freq);
    freq = freq * lacunarity;
    amp = amp * gain;
  }
  return sum * 0.5 + 0.5;
}
          `
        );

        const time = `(globals.v0.x + ${noiseTimeOffset}) * ${noiseTimeSpeed}`;
        const octF = `clamp(${noiseOctaves}, 1.0, 10.0)`;
        const octI = `i32(${octF} + 0.5)`;

        // mode is an int param living in float param buffer.
        const isMode0 = `(${noiseMode} < 0.5)`;
        const isMode1 = `(${noiseMode} >= 0.5 && ${noiseMode} < 1.5)`;

        const simplex2d = `(noise_simplex2d_fbm(${uvIn.code} * ${noiseScale}, ${time}, ${octI}, ${noiseLacunarity}, ${noiseGain}) * ${noiseIntensity})`;

        const z = `(${time} * ${noiseScale})`;
        const p3 = `vec3<f32>((${uvIn.code}).x * ${noiseScale}, (${uvIn.code}).y * ${noiseScale}, ${z})`;
        const simplex3dRaw = `noise_simplex3d_fbm(${p3}, ${octI}, ${noiseLacunarity}, ${noiseGain})`;
        const simplex3d = `(clamp(${simplex3dRaw} * 0.5 + 0.5, 0.0, 1.0) * ${noiseIntensity})`;

        const aspect = `(globals.v0.z / globals.v0.w)`;
        const uvAspect = `(${uvIn.code} - vec2<f32>(0.5, 0.5)) * vec2<f32>(${aspect}, 1.0)`;
        const valueFbm = `(noise_value_fbm(${uvAspect}, ${time}, ${noiseScale}, ${octI}, ${noiseLacunarity}, ${noiseGain}) * ${noiseIntensity})`;

        const out = `select(${valueFbm}, select(${simplex3d}, ${simplex2d}, ${isMode0}), ${isMode1})`;
        setNodeOut(nodeId, 'out', { type: 'f32', code: out });
        break;
      }
      case 'voronoi-noise': {
        const uvIn = resolveInputVec2(nodeId, 'in');
        if (!uvIn) break;

        const scale = paramSlotExprWired(paramLayout, nodeId, 'voronoiScale', 0);
        const jitter = paramSlotExprWired(paramLayout, nodeId, 'voronoiJitter', 0);
        const metricF = paramSlotExprWired(paramLayout, nodeId, 'voronoiDistanceMetric', 0);
        const driftDirDeg = paramSlotExprWired(paramLayout, nodeId, 'voronoiDriftDirection', 0);
        const driftAmt = paramSlotExprWired(paramLayout, nodeId, 'voronoiDriftAmount', 0);
        const animModeF = paramSlotExprWired(paramLayout, nodeId, 'voronoiAnimationMode', 0);
        const rotSpeedDeg = paramSlotExprWired(paramLayout, nodeId, 'voronoiRotationSpeed', 0);
        const timeSpeed = paramSlotExprWired(paramLayout, nodeId, 'voronoiTimeSpeed', 0);
        const timeOffset = paramSlotExprWired(paramLayout, nodeId, 'voronoiTimeOffset', 0);
        const outputModeF = paramSlotExprWired(paramLayout, nodeId, 'voronoiOutputMode', 0);
        const intensity = paramSlotExprWired(paramLayout, nodeId, 'voronoiIntensity', 0);

        requireHelper(
          'voronoiNoise',
          `
fn voronoiRotate(p: vec2<f32>, angle: f32) -> vec2<f32> {
  let c = cos(angle);
  let s = sin(angle);
  return vec2<f32>(p.x * c - p.y * s, p.x * s + p.y * c);
}

fn voronoiRandom2(p: vec2<f32>) -> vec2<f32> {
  return fract(sin(vec2<f32>(
    dot(p, vec2<f32>(127.1, 311.7)),
    dot(p, vec2<f32>(269.5, 183.3))
  )) * 43758.5453);
}

fn voronoiHash21(p: vec2<f32>) -> f32 {
  return fract(sin(dot(p, vec2<f32>(127.1, 311.7))) * 43758.5453);
}

fn voronoiFull(p: vec2<f32>, jitter: f32, metric: i32) -> vec3<f32> {
  let i = floor(p);
  let f = fract(p);
  var f1 = 8.0;
  var f2 = 8.0;
  var cellId = vec2<f32>(0.0, 0.0);

  for (var y: i32 = -1; y <= 1; y = y + 1) {
    for (var x: i32 = -1; x <= 1; x = x + 1) {
      let neighbor = vec2<f32>(f32(x), f32(y));
      let point = voronoiRandom2(i + neighbor) * jitter;
      let diff = neighbor + point - f;
      var dist = 0.0;
      if (metric == 0) { dist = length(diff); }
      else if (metric == 1) { dist = abs(diff.x) + abs(diff.y); }
      else { dist = max(abs(diff.x), abs(diff.y)); }
      if (dist < f1) {
        f2 = f1;
        f1 = dist;
        cellId = i + neighbor;
      } else if (dist < f2) {
        f2 = dist;
      }
    }
  }
  let cellHash = voronoiHash21(cellId);
  return vec3<f32>(f1, f2, cellHash);
}
          `
        );

        const t = `((globals.v0.x + ${timeOffset}) * ${timeSpeed})`;
        const safeScale = `max(${scale}, 0.001)`;
        const metric = `i32(floor(${metricF} + 0.5))`;
        const animMode = `i32(floor(${animModeF} + 0.5))`;
        const outMode = `i32(floor(${outputModeF} + 0.5))`;

        const domain0 = `(${uvIn.code} * ${safeScale})`;
        const driftAngle = `(${driftDirDeg} * 0.017453292519943295)`;
        const driftDir = `vec2<f32>(cos(${driftAngle}), sin(${driftAngle}))`;
        const domainDrift = `(${domain0} + ${driftDir} * ${t} * ${driftAmt})`;
        const rotAngle = `(${t} * ${rotSpeedDeg} * 0.017453292519943295)`;
        const domainRot = `voronoiRotate(${domain0}, ${rotAngle})`;
        const domain = `select(${domain0}, select(${domainDrift}, ${domainRot}, ${animMode} == 1), ${animMode} != 0)`;

        const v = `voronoiFull(${domain}, ${jitter}, ${metric})`;
        const f1 = `(${v}).x`;
        const f2 = `(${v}).y`;
        const cellHash = `(${v}).z`;

        const valueF1 = `clamp(${f1} * 0.7, 0.0, 1.0)`;
        const valueF2mF1 = `clamp((${f2} - ${f1}) * 2.0, 0.0, 1.0)`;
        const valueEdge = `smoothstep(0.0, 0.08, ${f2} - ${f1})`;
        const valueCell = cellHash;

        const v01 = `select(${valueF1}, ${valueF2mF1}, ${outMode} == 1)`;
        const v23 = `select(${valueEdge}, ${valueCell}, ${outMode} == 3)`;
        const value = `select(${v01}, ${v23}, ${outMode} >= 2)`;

        setNodeOut(nodeId, 'out', { type: 'f32', code: `(${value} * ${intensity})` });
        break;
      }
      case 'volume-rays': {
        const uvIn = resolveInputVec2(nodeId, 'in');
        if (!uvIn) break;

        const volumeStepsF = paramSlotExprWired(paramLayout, nodeId, 'volumeSteps', 0);
        const volumeStepSize = paramSlotExprWired(paramLayout, nodeId, 'volumeStepSize', 0);
        const volumeDensityScale = paramSlotExprWired(paramLayout, nodeId, 'volumeDensityScale', 0);
        const volumeThreshold = paramSlotExprWired(paramLayout, nodeId, 'volumeThreshold', 0);
        const volumeContrast = paramSlotExprWired(paramLayout, nodeId, 'volumeContrast', 0);
        const volumeFalloff = paramSlotExprWired(paramLayout, nodeId, 'volumeFalloff', 0);
        const volumeIntensity = paramSlotExprWired(paramLayout, nodeId, 'volumeIntensity', 0);
        const volumeTimeSpeed = paramSlotExprWired(paramLayout, nodeId, 'volumeTimeSpeed', 0);
        const cameraPosX = paramSlotExprWired(paramLayout, nodeId, 'cameraPosX', 0);
        const cameraPosY = paramSlotExprWired(paramLayout, nodeId, 'cameraPosY', 0);
        const cameraPosZ = paramSlotExprWired(paramLayout, nodeId, 'cameraPosZ', 0);
        const cameraYaw = paramSlotExprWired(paramLayout, nodeId, 'cameraYaw', 0);
        const cameraPitch = paramSlotExprWired(paramLayout, nodeId, 'cameraPitch', 0);
        const cameraFovScale = paramSlotExprWired(paramLayout, nodeId, 'cameraFovScale', 0);

        requireHelper(
          'volumeRays',
          `
fn vr_hash11_vol(n: f32) -> f32 {
  return fract(sin(n) * 43758.5453);
}

fn vr_vnoise3(p: vec3<f32>) -> f32 {
  let ip = floor(p);
  let fp = fract(p);
  let n000 = vr_hash11_vol(dot(ip + vec3<f32>(0.0, 0.0, 0.0), vec3<f32>(1.0, 57.0, 113.0)));
  let n100 = vr_hash11_vol(dot(ip + vec3<f32>(1.0, 0.0, 0.0), vec3<f32>(1.0, 57.0, 113.0)));
  let n010 = vr_hash11_vol(dot(ip + vec3<f32>(0.0, 1.0, 0.0), vec3<f32>(1.0, 57.0, 113.0)));
  let n110 = vr_hash11_vol(dot(ip + vec3<f32>(1.0, 1.0, 0.0), vec3<f32>(1.0, 57.0, 113.0)));
  let n001 = vr_hash11_vol(dot(ip + vec3<f32>(0.0, 0.0, 1.0), vec3<f32>(1.0, 57.0, 113.0)));
  let n101 = vr_hash11_vol(dot(ip + vec3<f32>(1.0, 0.0, 1.0), vec3<f32>(1.0, 57.0, 113.0)));
  let n011 = vr_hash11_vol(dot(ip + vec3<f32>(0.0, 1.0, 1.0), vec3<f32>(1.0, 57.0, 113.0)));
  let n111 = vr_hash11_vol(dot(ip + vec3<f32>(1.0, 1.0, 1.0), vec3<f32>(1.0, 57.0, 113.0)));
  let w = fp * fp * (vec3<f32>(3.0) - 2.0 * fp);
  let x00 = mix(n000, n100, w.x);
  let x10 = mix(n010, n110, w.x);
  let x01 = mix(n001, n101, w.x);
  let x11 = mix(n011, n111, w.x);
  let y0 = mix(x00, x10, w.y);
  let y1 = mix(x01, x11, w.y);
  return mix(y0, y1, w.z);
}

fn vr_fbm(p: vec3<f32>) -> f32 {
  var value: f32 = 0.0;
  value = value + 0.55 * vr_vnoise3(p);
  value = value + 0.30 * vr_vnoise3(p * 2.07 + vec3<f32>(17.1, 3.7, 11.3));
  value = value + 0.15 * vr_vnoise3(p * 4.03 + vec3<f32>(5.4, 19.2, 2.8));
  return value;
}

fn vr_march_acc(
  uv: vec2<f32>,
  yaw: f32,
  pitch: f32,
  ro: vec3<f32>,
  fovScale: f32,
  stepSize: f32,
  densScale: f32,
  threshold: f32,
  contrast: f32,
  falloff: f32,
  steps: i32,
  wallTime: f32,
  timeSpeed: f32,
) -> f32 {
  let forward = normalize(vec3<f32>(cos(pitch) * sin(yaw), sin(pitch), -cos(pitch) * cos(yaw)));
  let right = vec3<f32>(cos(yaw), 0.0, sin(yaw));
  let up = vec3<f32>(-sin(pitch) * sin(yaw), cos(pitch), sin(pitch) * cos(yaw));
  let uvS = uv * fovScale;
  let rdCam = normalize(vec3<f32>(uvS, -1.0));
  let rd = normalize(right * rdCam.x + up * rdCam.y - forward * rdCam.z);
  var acc: f32 = 0.0;
  var z: f32 = 0.0;
  for (var i: i32 = 0; i < 128; i = i + 1) {
    if (i >= steps) { break; }
    let pos = ro + z * rd;
    let drift = vec3<f32>(0.0, 0.0, wallTime * timeSpeed);
    let cloud = vr_fbm(pos * densScale + drift);
    let edgeWidth = max(0.02, 1.0 / max(contrast, 0.001));
    let dens = smoothstep(threshold, threshold + edgeWidth, cloud);
    let distanceFade = exp(-z * falloff);
    acc = acc + dens * stepSize * distanceFade;
    z = z + stepSize;
    if (z > 20.0) { break; }
  }
  let norm = clamp(1.0 - exp(-acc * 0.75), 0.0, 1.0);
  return norm;
}
          `
        );

        const stepsClamped = `clamp(i32(round(${volumeStepsF})), 8, 128)`;
        const marched = `vr_march_acc(${uvIn.code}, ${cameraYaw}, ${cameraPitch}, vec3<f32>(${cameraPosX}, ${cameraPosY}, ${cameraPosZ}), ${cameraFovScale}, ${volumeStepSize}, ${volumeDensityScale}, ${volumeThreshold}, ${volumeContrast}, ${volumeFalloff}, ${stepsClamped}, globals.v0.x, ${volumeTimeSpeed})`;
        setNodeOut(nodeId, 'out', { type: 'f32', code: `(${marched} * ${volumeIntensity})` });
        break;
      }
      case 'cubic-curl-noise': {
        const uvIn = resolveInputVec2(nodeId, 'in');
        if (!uvIn) break;

        const scale = paramSlotExprWired(paramLayout, nodeId, 'cubicCurlScale', 0);
        const timeSpeed = paramSlotExprWired(paramLayout, nodeId, 'cubicCurlTimeSpeed', 0);
        const timeOffset = paramSlotExprWired(paramLayout, nodeId, 'cubicCurlTimeOffset', 0);
        const intensity = paramSlotExprWired(paramLayout, nodeId, 'cubicCurlIntensity', 0);

        requireHelper(
          'cubicCurlNoise',
          `
fn cubicCurlHash11(n: f32) -> f32 { return fract(sin(n) * 43758.5453); }

fn cubicCurlQuintic(t: f32) -> f32 { return t * t * t * (t * (t * 6.0 - 15.0) + 10.0); }

fn cubicCurlVnoise3(p: vec3<f32>) -> f32 {
  let ip = floor(p);
  let fp = fract(p);
  let w = vec3<f32>(cubicCurlQuintic(fp.x), cubicCurlQuintic(fp.y), cubicCurlQuintic(fp.z));

  let n000 = cubicCurlHash11(dot(ip + vec3<f32>(0.0, 0.0, 0.0), vec3<f32>(1.0, 57.0, 113.0)));
  let n100 = cubicCurlHash11(dot(ip + vec3<f32>(1.0, 0.0, 0.0), vec3<f32>(1.0, 57.0, 113.0)));
  let n010 = cubicCurlHash11(dot(ip + vec3<f32>(0.0, 1.0, 0.0), vec3<f32>(1.0, 57.0, 113.0)));
  let n110 = cubicCurlHash11(dot(ip + vec3<f32>(1.0, 1.0, 0.0), vec3<f32>(1.0, 57.0, 113.0)));
  let n001 = cubicCurlHash11(dot(ip + vec3<f32>(0.0, 0.0, 1.0), vec3<f32>(1.0, 57.0, 113.0)));
  let n101 = cubicCurlHash11(dot(ip + vec3<f32>(1.0, 0.0, 1.0), vec3<f32>(1.0, 57.0, 113.0)));
  let n011 = cubicCurlHash11(dot(ip + vec3<f32>(0.0, 1.0, 1.0), vec3<f32>(1.0, 57.0, 113.0)));
  let n111 = cubicCurlHash11(dot(ip + vec3<f32>(1.0, 1.0, 1.0), vec3<f32>(1.0, 57.0, 113.0)));

  let x00 = mix(n000, n100, w.x);
  let x10 = mix(n010, n110, w.x);
  let x01 = mix(n001, n101, w.x);
  let x11 = mix(n011, n111, w.x);
  let y0 = mix(x00, x10, w.y);
  let y1 = mix(x01, x11, w.y);
  return mix(y0, y1, w.z) * 2.0 - 1.0;
}

fn cubicCurlPotential(p: vec3<f32>) -> f32 { return cubicCurlVnoise3(p) + 0.5 * cubicCurlVnoise3(p * 2.0); }

fn cubicCurlCurlMagnitude(uv: vec2<f32>, t: f32, scale: f32) -> f32 {
  let eps = 0.002;
  let p0 = vec3<f32>(uv * scale, t);
  let Fyp = cubicCurlPotential(p0 + vec3<f32>(0.0, eps, 0.0));
  let Fym = cubicCurlPotential(p0 - vec3<f32>(0.0, eps, 0.0));
  let Fxp = cubicCurlPotential(p0 + vec3<f32>(eps, 0.0, 0.0));
  let Fxm = cubicCurlPotential(p0 - vec3<f32>(eps, 0.0, 0.0));
  let dFdy = (Fyp - Fym) / (2.0 * eps);
  let dFdx = (Fxp - Fxm) / (2.0 * eps);
  return length(vec2<f32>(dFdy, -dFdx));
}
          `
        );

        const aspect = `(globals.v0.z / globals.v0.w)`;
        const uv = `((${uvIn.code} - vec2<f32>(0.5, 0.5)) * vec2<f32>(${aspect}, 1.0))`;
        const t = `((globals.v0.x + ${timeOffset}) * ${timeSpeed})`;
        const mag = `cubicCurlCurlMagnitude(${uv}, ${t}, ${scale})`;
        const out = `(${mag} * 0.5 + 0.5)`;
        setNodeOut(nodeId, 'out', { type: 'f32', code: `(${out} * ${intensity})` });
        break;
      }
      case 'warp-terrain': {
        const uvIn = resolveInputVec2(nodeId, 'in');
        if (!uvIn) break;

        const terrainScale = paramSlotExprWired(paramLayout, nodeId, 'warpTerrainScale', 0);
        const timeSpeed = paramSlotExprWired(paramLayout, nodeId, 'warpTimeSpeed', 0);
        const timeOffset = paramSlotExprWired(paramLayout, nodeId, 'warpTimeOffset', 0);
        const ridge = paramSlotExprWired(paramLayout, nodeId, 'warpTerrainRidge', 0);
        const bump = paramSlotExprWired(paramLayout, nodeId, 'warpTerrainBump', 0);

        requireHelper(
          'warpTerrain',
          `
struct WarpTerFields {
  ti: f32,
  bl: f32,
}

const warp_m = mat2x2<f32>(0.80, 0.60, -0.60, 0.80);

fn warp_hash(p: vec2<f32>) -> f32 {
  let h = dot(p, vec2<f32>(127.1, 311.7));
  return -1.0 + 2.0 * fract(sin(h) * 43758.5453123);
}

fn warp_noise(p: vec2<f32>) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (vec2<f32>(3.0, 3.0) - 2.0 * f);
  return mix(
    mix(warp_hash(i + vec2<f32>(0.0, 0.0)), warp_hash(i + vec2<f32>(1.0, 0.0)), u.x),
    mix(warp_hash(i + vec2<f32>(0.0, 1.0)), warp_hash(i + vec2<f32>(1.0, 1.0)), u.x),
    u.y
  );
}

fn warp_fbm(pIn: vec2<f32>) -> f32 {
  var p = pIn;
  var f = 0.0;
  f = f + 0.5000 * warp_noise(p);  p = (warp_m * p) * 2.02;
  f = f + 0.2500 * warp_noise(p);  p = (warp_m * p) * 2.03;
  f = f + 0.1250 * warp_noise(p);  p = (warp_m * p) * 2.01;
  f = f + 0.0625 * warp_noise(p);
  return f / 0.9375;
}

fn warp_fbm2(p: vec2<f32>) -> vec2<f32> { return vec2<f32>(warp_fbm(p), warp_fbm(p.yx)); }

fn warp_ter_fields(pIn: vec2<f32>, time: f32, terrainScale: f32, timeSpeedF: f32) -> WarpTerFields {
  let pScaled = pIn * terrainScale;
  let tScale = timeSpeedF * 0.05;
  let q = tScale * time + pScaled + warp_fbm2(-tScale * time + 2.0 * (pScaled + warp_fbm2(4.0 * pScaled)));
  let f_q = dot(warp_fbm2(q), vec2<f32>(1.0, -1.0));
  let bl = smoothstep(-0.8, 0.8, f_q);
  let ti = smoothstep(-1.0, 1.0, warp_fbm(pScaled));
  return WarpTerFields(ti, bl);
}

fn warp_ter_neutral_gray(ti: f32, bl: f32) -> f32 {
  return mix(mix(0.18, 0.92, ti), 0.06, bl);
}

fn warp_ter_frag_main(
  p: vec2<f32>,
  time: f32,
  terrainScale: f32,
  timeSpeedF: f32,
  ridgeAmt: f32,
  bumpAmt: f32
) -> vec4<f32> {
  let e = 0.0045;
  let Fc = warp_ter_fields(p, time, terrainScale, timeSpeedF);
  let Fa = warp_ter_fields(p + vec2<f32>(e, 0.0), time, terrainScale, timeSpeedF);
  let Fb = warp_ter_fields(p + vec2<f32>(0.0, e), time, terrainScale, timeSpeedF);
  let colc = vec3<f32>(warp_ter_neutral_gray(Fc.ti, Fc.bl));
  let cola = vec3<f32>(warp_ter_neutral_gray(Fa.ti, Fa.bl));
  let colb = vec3<f32>(warp_ter_neutral_gray(Fb.ti, Fb.bl));
  let gc = dot(colc, vec3<f32>(0.333, 0.333, 0.333));
  let ga = dot(cola, vec3<f32>(0.333, 0.333, 0.333));
  let gb = dot(colb, vec3<f32>(0.333, 0.333, 0.333));
  let nor = normalize(vec3<f32>(ga - gc, e, gb - gc));
  let ridgeRgb = vec3<f32>(1.0, 1.0, 1.0);
  let ridge = max(ridgeAmt, 0.0);
  let accented = colc + ridgeRgb * ridge * 8.0 * abs(2.0 * gc - ga - gb);
  let bump = max(bumpAmt, 0.0);
  let Ny = nor.y;
  let col = accented * (1.0 + bump * 0.2 * Ny * Ny) + vec3<f32>(bump * 0.05 * Ny * Ny * Ny);
  return vec4<f32>(col, 1.0);
}
          `
        );

        const aspect = `(globals.v0.z / globals.v0.w)`;
        const uv = uvIn.code;
        const p = `((${uv} - vec2<f32>(0.5, 0.5)) * vec2<f32>(${aspect} * 2.0, 2.0))`;

        const warpTime = `(globals.v0.x + ${timeOffset})`;
        const out = `warp_ter_frag_main(${p}, ${warpTime}, ${terrainScale}, ${timeSpeed}, ${ridge}, ${bump})`;
        setNodeOut(nodeId, 'out', { type: 'vec4<f32>', code: out });
        break;
      }
      case 'bayer-dither': {
        const inVal = asF32(resolveInput(nodeId, 'in', 'in') ?? { type: 'f32', code: '0.0' });
        if (!inVal) break;

        // Prefer explicit wiring; provide reasonable fallbacks so the node is usable in MVP graphs.
        // `tryResolveInputVec2` returns null on unconnected so the semantic default applies (vs.
        // the GLSL-parity vec2(0.0) typed zero from `resolveInputVec2`).
        const fragCoord =
          tryResolveInputVec2(nodeId, 'fragCoord') ??
          ({ type: 'vec2<f32>', code: `(in.uv * globals.v0.zw)` } satisfies Expr);
        const resolution =
          tryResolveInputVec2(nodeId, 'resolution') ??
          ({ type: 'vec2<f32>', code: `globals.v0.zw` } satisfies Expr);

        const strength = paramSlotExprWired(paramLayout, nodeId, 'strength', 0);
        const pixelSize = `max(${paramSlotExprWired(paramLayout, nodeId, 'pixelSize', 0)}, 0.0001)`;

        requireHelper(
          'bayer-dither',
          `
fn bayer2(aIn: vec2<f32>) -> f32 {
  let a = floor(aIn);
  return fract(a.x / 2.0 + a.y * a.y * 0.75);
}

fn bayer4(a: vec2<f32>) -> f32 {
  return bayer2(0.5 * a) * 0.25 + bayer2(a);
}

fn bayer8(a: vec2<f32>) -> f32 {
  return bayer4(0.5 * a) * 0.25 + bayer2(a);
}
          `
        );

        const fragCoordCentered = `(${fragCoord.code} - ${resolution.code} * 0.5)`;
        const bayer = `((bayer8(${fragCoordCentered} / ${pixelSize}) - 0.5) * ${strength})`;
        const out = `clamp(${inVal.code} + ${bayer}, 0.0, 1.0)`;
        setNodeOut(nodeId, 'out', { type: 'f32', code: out });
        break;
      }
      case 'oklch-color': {
        const l = paramSlotExprWired(paramLayout, nodeId, 'l', 0);
        const c = paramSlotExprWired(paramLayout, nodeId, 'c', 0);
        const h = paramSlotExprWired(paramLayout, nodeId, 'h', 0);
        setNodeOut(nodeId, 'out', { type: 'vec3<f32>', code: `vec3<f32>(${l}, ${c}, ${h})` });
        break;
      }
      case 'bezier-curve': {
        const x1 = paramSlotExprWired(paramLayout, nodeId, 'x1', 0);
        const y1 = paramSlotExprWired(paramLayout, nodeId, 'y1', 0);
        const x2 = paramSlotExprWired(paramLayout, nodeId, 'x2', 0);
        const y2 = paramSlotExprWired(paramLayout, nodeId, 'y2', 0);
        setNodeOut(nodeId, 'out', { type: 'vec4<f32>', code: `vec4<f32>(${x1}, ${y1}, ${x2}, ${y2})` });
        break;
      }
      case 'blend-mode': {
        const base = resolveInput(nodeId, 'base');
        const blend = resolveInput(nodeId, 'blend', 'blend');
        if (!base || !blend) break;
        const b0 = asF32(base) ?? coerceToType(base, 'f32');
        const b1 = asF32(blend) ?? coerceToType(blend, 'f32');
        if (!b0 || !b1) break;

        const mode = paramSlotExprWired(paramLayout, nodeId, 'mode', 0);
        const opacity = paramSlotExprWired(paramLayout, nodeId, 'opacity', 0);

        requireHelper(
          'blend-mode',
          `
fn blendMultiply(base: f32, blend: f32) -> f32 { return base * blend; }
fn blendScreen(base: f32, blend: f32) -> f32 { return 1.0 - (1.0 - base) * (1.0 - blend); }
fn blendOverlay(base: f32, blend: f32) -> f32 {
  return select(2.0 * base * blend, 1.0 - 2.0 * (1.0 - base) * (1.0 - blend), base >= 0.5);
}
fn blendSoftLight(base: f32, blend: f32) -> f32 {
  return select(
    base - (1.0 - 2.0 * blend) * base * (1.0 - base),
    base + (2.0 * blend - 1.0) * (sqrt(base) - base),
    blend >= 0.5
  );
}
fn blendHardLight(base: f32, blend: f32) -> f32 {
  return select(2.0 * base * blend, 1.0 - 2.0 * (1.0 - base) * (1.0 - blend), blend >= 0.5);
}
fn blendColorDodge(base: f32, blend: f32) -> f32 { return base / (1.0 - blend + 0.001); }
fn blendColorBurn(base: f32, blend: f32) -> f32 { return 1.0 - (1.0 - base) / (blend + 0.001); }
fn blendLinearDodge(base: f32, blend: f32) -> f32 { return min(base + blend, 1.0); }
fn blendLinearBurn(base: f32, blend: f32) -> f32 { return max(base + blend - 1.0, 0.0); }
fn blendDifference(base: f32, blend: f32) -> f32 { return abs(base - blend); }
fn blendExclusion(base: f32, blend: f32) -> f32 { return base + blend - 2.0 * base * blend; }

fn applyBlendMode(base: f32, blend: f32, mode: f32) -> f32 {
  let m0 = mode < 0.5;
  let m1 = mode >= 0.5 && mode < 1.5;
  let m2 = mode >= 1.5 && mode < 2.5;
  let m3 = mode >= 2.5 && mode < 3.5;
  let m4 = mode >= 3.5 && mode < 4.5;
  let m5 = mode >= 4.5 && mode < 5.5;
  let m6 = mode >= 5.5 && mode < 6.5;
  let m7 = mode >= 6.5 && mode < 7.5;
  let m8 = mode >= 7.5 && mode < 8.5;
  let m9 = mode >= 8.5 && mode < 9.5;
  let m10 = mode >= 9.5 && mode < 10.5;
  let m11 = mode >= 10.5;

  let r1 = blendMultiply(base, blend);
  let r2 = blendScreen(base, blend);
  let r3 = blendOverlay(base, blend);
  let r4 = blendSoftLight(base, blend);
  let r5 = blendHardLight(base, blend);
  let r6 = blendColorDodge(base, blend);
  let r7 = blendColorBurn(base, blend);
  let r8 = blendLinearDodge(base, blend);
  let r9 = blendLinearBurn(base, blend);
  let r10 = blendDifference(base, blend);
  let r11 = blendExclusion(base, blend);

  // Weighted selection to avoid deep if ladders; keep deterministic with float masks.
  return
    blend * select(0.0, 1.0, m0) +
    r1 * select(0.0, 1.0, m1) +
    r2 * select(0.0, 1.0, m2) +
    r3 * select(0.0, 1.0, m3) +
    r4 * select(0.0, 1.0, m4) +
    r5 * select(0.0, 1.0, m5) +
    r6 * select(0.0, 1.0, m6) +
    r7 * select(0.0, 1.0, m7) +
    r8 * select(0.0, 1.0, m8) +
    r9 * select(0.0, 1.0, m9) +
    r10 * select(0.0, 1.0, m10) +
    r11 * select(0.0, 1.0, m11);
}
          `
        );

        const blended = `applyBlendMode(${b0.code}, ${b1.code}, ${mode})`;
        setNodeOut(nodeId, 'out', { type: 'f32', code: `mix(${b0.code}, ${blended}, ${opacity})` });
        break;
      }
      case 'blend-color': {
        const baseV = resolveInputVec4(nodeId, 'base');
        const blendV = resolveInputVec4(nodeId, 'blend');
        if (!baseV || !blendV) break;

        const mode = paramSlotExprWired(paramLayout, nodeId, 'mode', 0);
        const opacity = paramSlotExprWired(paramLayout, nodeId, 'opacity', 0);

        requireHelper(
          'blend-mode',
          `
fn blendMultiply(base: f32, blend: f32) -> f32 { return base * blend; }
fn blendScreen(base: f32, blend: f32) -> f32 { return 1.0 - (1.0 - base) * (1.0 - blend); }
fn blendOverlay(base: f32, blend: f32) -> f32 {
  return select(2.0 * base * blend, 1.0 - 2.0 * (1.0 - base) * (1.0 - blend), base >= 0.5);
}
fn blendSoftLight(base: f32, blend: f32) -> f32 {
  return select(
    base - (1.0 - 2.0 * blend) * base * (1.0 - base),
    base + (2.0 * blend - 1.0) * (sqrt(base) - base),
    blend >= 0.5
  );
}
fn blendHardLight(base: f32, blend: f32) -> f32 {
  return select(2.0 * base * blend, 1.0 - 2.0 * (1.0 - base) * (1.0 - blend), blend >= 0.5);
}
fn blendColorDodge(base: f32, blend: f32) -> f32 { return base / (1.0 - blend + 0.001); }
fn blendColorBurn(base: f32, blend: f32) -> f32 { return 1.0 - (1.0 - base) / (blend + 0.001); }
fn blendLinearDodge(base: f32, blend: f32) -> f32 { return min(base + blend, 1.0); }
fn blendLinearBurn(base: f32, blend: f32) -> f32 { return max(base + blend - 1.0, 0.0); }
fn blendDifference(base: f32, blend: f32) -> f32 { return abs(base - blend); }
fn blendExclusion(base: f32, blend: f32) -> f32 { return base + blend - 2.0 * base * blend; }

fn applyBlendMode(base: f32, blend: f32, mode: f32) -> f32 {
  let m0 = mode < 0.5;
  let m1 = mode >= 0.5 && mode < 1.5;
  let m2 = mode >= 1.5 && mode < 2.5;
  let m3 = mode >= 2.5 && mode < 3.5;
  let m4 = mode >= 3.5 && mode < 4.5;
  let m5 = mode >= 4.5 && mode < 5.5;
  let m6 = mode >= 5.5 && mode < 6.5;
  let m7 = mode >= 6.5 && mode < 7.5;
  let m8 = mode >= 7.5 && mode < 8.5;
  let m9 = mode >= 8.5 && mode < 9.5;
  let m10 = mode >= 9.5 && mode < 10.5;
  let m11 = mode >= 10.5;

  let r1 = blendMultiply(base, blend);
  let r2 = blendScreen(base, blend);
  let r3 = blendOverlay(base, blend);
  let r4 = blendSoftLight(base, blend);
  let r5 = blendHardLight(base, blend);
  let r6 = blendColorDodge(base, blend);
  let r7 = blendColorBurn(base, blend);
  let r8 = blendLinearDodge(base, blend);
  let r9 = blendLinearBurn(base, blend);
  let r10 = blendDifference(base, blend);
  let r11 = blendExclusion(base, blend);

  return
    blend * select(0.0, 1.0, m0) +
    r1 * select(0.0, 1.0, m1) +
    r2 * select(0.0, 1.0, m2) +
    r3 * select(0.0, 1.0, m3) +
    r4 * select(0.0, 1.0, m4) +
    r5 * select(0.0, 1.0, m5) +
    r6 * select(0.0, 1.0, m6) +
    r7 * select(0.0, 1.0, m7) +
    r8 * select(0.0, 1.0, m8) +
    r9 * select(0.0, 1.0, m9) +
    r10 * select(0.0, 1.0, m10) +
    r11 * select(0.0, 1.0, m11);
}
          `
        );

        const b = baseV.code;
        const s = blendV.code;
        const blendedRgb = `vec3<f32>(applyBlendMode(${b}.x, ${s}.x, ${mode}), applyBlendMode(${b}.y, ${s}.y, ${mode}), applyBlendMode(${b}.z, ${s}.z, ${mode}))`;
        const rgb = `mix(${b}.xyz, ${blendedRgb}, ${opacity})`;
        const a = `mix(${b}.w, ${s}.w, ${opacity})`;
        setNodeOut(nodeId, 'out', { type: 'vec4<f32>', code: `vec4<f32>(${rgb}, ${a})` });
        break;
      }
      case 'scanlines': {
        const cIn = resolveInputVec4(nodeId, 'in');
        if (!cIn) break;

        const freq = paramSlotExprWired(paramLayout, nodeId, 'scanlineFrequency', 0);
        const thickness = paramSlotExprWired(paramLayout, nodeId, 'scanlineThickness', 0);
        const opacity = paramSlotExprWired(paramLayout, nodeId, 'scanlineOpacity', 0);
        const timeSpeed = paramSlotExprWired(paramLayout, nodeId, 'scanlineTimeSpeed', 0);
        const timeOffset = paramSlotExprWired(paramLayout, nodeId, 'scanlineTimeOffset', 0);

        requireHelper(
          'scanlines',
          `
fn scanlineEffect(value: f32, p: vec2<f32>, frequency: f32, thickness: f32, opacity: f32, time: f32) -> f32 {
  let scanlineY = p.y + time * 0.1;
  var scanline = sin(scanlineY * frequency * 3.14159);
  scanline = step(1.0 - thickness, scanline);
  return mix(value, value * (1.0 - opacity), scanline);
}
          `
        );

        const color = `${cIn.code}.xyz`;
        const lum = `dot(${color}, vec3<f32>(0.2126, 0.7152, 0.0722))`;
        const p = `(((in.uv / vec2<f32>(1.0, 1.0)) * 2.0 - vec2<f32>(1.0, 1.0)) * vec2<f32>(globals.v0.z / globals.v0.w, 1.0))`;
        const t = `(globals.v0.x + ${timeOffset}) * ${timeSpeed}`;
        const scanned = `scanlineEffect(${lum}, ${p}, ${freq}, ${thickness}, ${opacity}, ${t})`;
        const ratio = `(${scanned} / max(${lum}, 1e-4))`;
        const scaled = `(clamp(${color} * ${ratio}, vec3<f32>(0.0), vec3<f32>(1.0)))`;
        const safe = `(select(vec3<f32>(${scanned}), ${scaled}, (${lum}) > 1e-4))`;
        setNodeOut(nodeId, 'out', { type: 'vec4<f32>', code: `vec4<f32>(${safe}, (${cIn.code}).w)` });
        break;
      }
      case 'chromatic-aberration': {
        const cIn = resolveInputVec4(nodeId, 'in');
        if (!cIn) break;

        const strength = paramSlotExprWired(paramLayout, nodeId, 'chromaticStrength', 0);
        const centerX = paramSlotExprWired(paramLayout, nodeId, 'chromaticCenterX', 0);
        const centerY = paramSlotExprWired(paramLayout, nodeId, 'chromaticCenterY', 0);
        const falloff = paramSlotExprWired(paramLayout, nodeId, 'chromaticFalloff', 0);

        const direction = paramSlotExprWired(paramLayout, nodeId, 'chromaticDirection', 0);

        requireHelper(
          'chromatic-aberration',
          `
fn applyChromaticAberration(color: vec3<f32>, p: vec2<f32>, center: vec2<f32>, strength: f32, falloff: f32, direction_deg: f32) -> vec3<f32> {
  let offset = p - center;
  let dist = length(offset);
  let dir = select(vec2<f32>(1.0, 0.0), normalize(offset), dist > 0.001);
  let rad = radians(direction_deg);
  let sep_axis = normalize(vec2<f32>(cos(rad), sin(rad)));
  let sep = dot(dir, sep_axis);
  let f = 1.0 / max(1.0 + dist * falloff, 0.001);
  let k = strength * dist * 0.55 * f;
  let rMod = 1.0 + sep * k;
  let gMod = 1.0;
  let bMod = 1.0 - sep * k;
  return clamp(vec3<f32>(color.r * rMod, color.g * gMod, color.b * bMod), vec3<f32>(0.0), vec3<f32>(1.0));
}
          `
        );

        const aspect = `(globals.v0.z / max(1.0, globals.v0.w))`;
        const p = `((in.uv * 2.0 - vec2<f32>(1.0, 1.0)) * vec2<f32>(${aspect}, 1.0))`;
        const center = `vec2<f32>(${centerX}, ${centerY})`;
        const color = `${cIn.code}.xyz`;
        const result = `applyChromaticAberration(${color}, ${p}, ${center}, ${strength}, ${falloff}, ${direction})`;

        setNodeOut(nodeId, 'out', {
          type: 'vec4<f32>',
          code: `vec4<f32>(${result}, (${cIn.code}).w)`,
        });
        break;
      }
      case 'rgb-separation': {
        const cIn = resolveInputVec4(nodeId, 'in');
        if (!cIn) break;

        const rx = paramSlotExprWired(paramLayout, nodeId, 'rgbSeparationRX', 0);
        const ry = paramSlotExprWired(paramLayout, nodeId, 'rgbSeparationRY', 0);
        const gx = paramSlotExprWired(paramLayout, nodeId, 'rgbSeparationGX', 0);
        const gy = paramSlotExprWired(paramLayout, nodeId, 'rgbSeparationGY', 0);
        const bx = paramSlotExprWired(paramLayout, nodeId, 'rgbSeparationBX', 0);
        const by = paramSlotExprWired(paramLayout, nodeId, 'rgbSeparationBY', 0);
        const strength = paramSlotExprWired(paramLayout, nodeId, 'rgbSeparationStrength', 0);

        requireHelper(
          'rgb-separation',
          `
fn rgbSeparation(color: vec3<f32>, p: vec2<f32>, rOffset: vec2<f32>, gOffset: vec2<f32>, bOffset: vec2<f32>, strength: f32) -> vec3<f32> {
  let k = 0.4 * strength;
  let rMod = 1.0 + dot(p, rOffset) * k;
  let gMod = 1.0 + dot(p, gOffset) * k;
  let bMod = 1.0 + dot(p, bOffset) * k;
  return clamp(vec3<f32>(color.r * rMod, color.g * gMod, color.b * bMod), vec3<f32>(0.0), vec3<f32>(1.0));
}
          `
        );

        const aspect = `(globals.v0.z / max(1.0, globals.v0.w))`;
        const p = `((in.uv * 2.0 - vec2<f32>(1.0, 1.0)) * vec2<f32>(${aspect}, 1.0))`;
        const color = `${cIn.code}.xyz`;
        const rOffset = `vec2<f32>(${rx}, ${ry})`;
        const gOffset = `vec2<f32>(${gx}, ${gy})`;
        const bOffset = `vec2<f32>(${bx}, ${by})`;
        const result = `rgbSeparation(${color}, ${p}, ${rOffset}, ${gOffset}, ${bOffset}, ${strength})`;

        setNodeOut(nodeId, 'out', {
          type: 'vec4<f32>',
          code: `vec4<f32>(${result}, (${cIn.code}).w)`,
        });
        break;
      }
      case 'edge-detection': {
        const cIn = resolveInputVec4(nodeId, 'in');
        if (!cIn) break;

        const threshold = paramSlotExprWired(paramLayout, nodeId, 'edgeThreshold', 0);
        const width = paramSlotExprWired(paramLayout, nodeId, 'edgeWidth', 0);
        const intensity = paramSlotExprWired(paramLayout, nodeId, 'edgeIntensity', 0);
        const strength = paramSlotExprWired(paramLayout, nodeId, 'edgeStrength', 0);

        const color = `${cIn.code}.xyz`;
        const lum = `dot(${color}, vec3<f32>(0.2126, 0.7152, 0.0722))`;
        const ridge = `abs(${lum} - ${threshold})`;
        const edges = `smoothstep(0.0, ${width}, ${ridge})`;
        const blendedLum = `mix(${lum}, (${edges} * ${intensity}), ${strength})`;
        const ratio = `(${blendedLum} / max(${lum}, 1e-4))`;
        const scaled = `clamp(${color} * ${ratio}, vec3<f32>(0.0), vec3<f32>(1.0))`;
        const safe = `(select(vec3<f32>(${blendedLum}), ${scaled}, (${lum}) > 1e-4))`;
        setNodeOut(nodeId, 'out', { type: 'vec4<f32>', code: `vec4<f32>(${safe}, (${cIn.code}).w)` });
        break;
      }
      case 'hex-prism-sdf': {
        const posIn = resolveInputVec3WithFallback(nodeId, 'position', [
          'positionX',
          'positionY',
          'positionZ',
        ]);
        if (!posIn) break;

        const hexRadius = paramSlotExprWired(paramLayout, nodeId, 'hexRadius', 0);
        const halfHeight = paramSlotExprWired(paramLayout, nodeId, 'halfHeight', 0);
        const offset = `vec3<f32>(${paramSlotExprWired(paramLayout, nodeId, 'positionX', 0)}, ${paramSlotExprWired(paramLayout, nodeId, 'positionY', 0)}, ${paramSlotExprWired(paramLayout, nodeId, 'positionZ', 0)})`;

        // Match GLSL node math (hex prism SDF).
        const q = `abs((${posIn.code}) - (${offset}))`;
        const d2 = `max(((${q}).x * 0.866025 + (${q}).y * 0.5), (${q}).y) - (${hexRadius})`;
        const d = `max(((${q}).z - (${halfHeight})), (${d2}))`;
        setNodeOut(nodeId, 'out', { type: 'f32', code: d });
        break;
      }
      case 'inflated-icosahedron': {
        const uvIc = resolveInputVec2(nodeId, 'in');
        if (!uvIc) break;

        const roLinkIc = lookupInputConnection(graph, nodeId, 'ro');
        let roIc: Expr;
        if (roLinkIc) {
          const srcRoIc = resolveNodeOut(roLinkIc.sourceNodeId, roLinkIc.sourcePort);
          if (!srcRoIc) break;
          const coercedRoIc = coerceToType(srcRoIc, 'vec3<f32>');
          if (!coercedRoIc) break;
          roIc = coercedRoIc;
        } else {
          const orbitRadiusIc = paramSlotExprWired(paramLayout, nodeId, 'orbitRadius', 0);
          const orbitSpeedIc = paramSlotExprWired(paramLayout, nodeId, 'orbitSpeed', 0);
          roIc = {
            type: 'vec3<f32>',
            code: `vec3<f32>(${orbitRadiusIc} * cos(globals.v0.x * ${orbitSpeedIc}), 0.0, ${orbitRadiusIc} * sin(globals.v0.x * ${orbitSpeedIc}))`,
          };
        }

        const rdLinkIc = lookupInputConnection(graph, nodeId, 'rd');
        let rdIc: Expr;
        if (rdLinkIc) {
          const rdOutIc = resolveNodeOut(rdLinkIc.sourceNodeId, rdLinkIc.sourcePort);
          if (!rdOutIc) break;
          const rdCoercedIc = coerceToType(rdOutIc, 'vec3<f32>');
          if (!rdCoercedIc) break;
          rdIc = rdCoercedIc;
        } else {
          rdIc = { type: 'vec3<f32>', code: 'vec3<f32>(0.0, 0.0, 0.0)' };
        }

        requireHelper('inflated-icosahedron', INFLATED_ICOSAHEDRON_MVP_WGSL);

        const timeScaleIc = paramSlotExprWired(paramLayout, nodeId, 'timeScale', 0);
        const twistAmountIc = paramSlotExprWired(paramLayout, nodeId, 'twistAmount', 0);
        const seamlessLoopIc = `i32(clamp(floor(${paramSlotExprWired(paramLayout, nodeId, 'seamlessLoop', 0)} + 0.5), 0.0, 1.0))`;
        const raymarchStepsIc = `i32(clamp(floor(${paramSlotExprWired(paramLayout, nodeId, 'raymarchSteps', 0)} + 0.5), 32.0, 150.0))`;
        const brightnessIc = paramSlotExprWired(paramLayout, nodeId, 'brightness', 0);
        const bgInnerIc = `infl_ic_oklch_to_rgb(vec3<f32>(${paramSlotExprWired(paramLayout, nodeId, 'bgInnerL', 0)}, ${paramSlotExprWired(paramLayout, nodeId, 'bgInnerC', 0)}, ${paramSlotExprWired(paramLayout, nodeId, 'bgInnerH', 0)}))`;
        const bgOuterIc = `infl_ic_oklch_to_rgb(vec3<f32>(${paramSlotExprWired(paramLayout, nodeId, 'bgOuterL', 0)}, ${paramSlotExprWired(paramLayout, nodeId, 'bgOuterC', 0)}, ${paramSlotExprWired(paramLayout, nodeId, 'bgOuterH', 0)}))`;
        const bgFalloffIc = paramSlotExprWired(paramLayout, nodeId, 'bgFalloff', 0);
        const paletteHueIc = paramSlotExprWired(paramLayout, nodeId, 'paletteHue', 0);
        const shapeSizeIc = paramSlotExprWired(paramLayout, nodeId, 'shapeSize', 0);
        const lightAngleIc = paramSlotExprWired(paramLayout, nodeId, 'lightAngle', 0);
        const contrastIc = paramSlotExprWired(paramLayout, nodeId, 'contrast', 0);

        const pxIc = `inflated_icosahedron_standalone_pixel(${uvIc.code}, ${roIc.code}, ${rdIc.code}, globals.v0.x, ${timeScaleIc}, ${twistAmountIc}, ${seamlessLoopIc}, ${raymarchStepsIc}, ${brightnessIc}, ${bgInnerIc}, ${bgOuterIc}, ${bgFalloffIc}, ${paletteHueIc}, ${shapeSizeIc}, ${lightAngleIc}, ${contrastIc})`;
        setNodeOut(nodeId, 'out', { type: 'vec3<f32>', code: pxIc });
        break;
      }
      case 'repeated-hex-prism-sdf': {
        const posIn = resolveInputVec3WithFallback(nodeId, 'position', [
          'positionX',
          'positionY',
          'positionZ',
        ]);
        if (!posIn) break;

        requireHelper('repeated-hex-prism-sdf-wgsl', REPEATED_HEX_PRISM_SDF_WGSL);
        const spacing = `vec3<f32>(${paramSlotExprWired(paramLayout, nodeId, 'spacingX', 0)}, ${paramSlotExprWired(paramLayout, nodeId, 'spacingY', 0)}, ${paramSlotExprWired(paramLayout, nodeId, 'spacingZ', 0)})`;
        const hexRadius = paramSlotExprWired(paramLayout, nodeId, 'hexRadius', 0);
        const halfHeight = paramSlotExprWired(paramLayout, nodeId, 'halfHeight', 0);
        setNodeOut(nodeId, 'out', {
          type: 'f32',
          code: `repeatedHexPrismSdf_distance(${posIn.code}, ${spacing}, ${hexRadius}, ${halfHeight})`,
        });
        break;
      }
      case 'radial-repeat-sdf': {
        const posIn = resolveInputVec3WithFallback(nodeId, 'position', [
          'positionX',
          'positionY',
          'positionZ',
        ]);
        if (!posIn) break;

        requireHelper('radial-repeat-sdf-wgsl', RADIAL_REPEAT_SDF_WGSL);
        const shellSpacing = paramSlotExprWired(paramLayout, nodeId, 'shellSpacing', 0);
        const ringPhase = paramSlotExprWired(paramLayout, nodeId, 'ringPhase', 0);
        setNodeOut(nodeId, 'out', {
          type: 'f32',
          code: `radialRepeatSdf_distance(${posIn.code}, ${shellSpacing}, (${ringPhase}) * (${shellSpacing}))`,
        });
        break;
      }
      case 'displacement-3d': {
        const posIn = resolveInputVec3WithFallback(nodeId, 'position', [
          'positionX',
          'positionY',
          'positionZ',
        ]);
        if (!posIn) break;

        const scale = paramSlotExprWired(paramLayout, nodeId, 'scale', 0);
        const octaves = paramSlotExprWired(paramLayout, nodeId, 'octaves', 0);
        const lacunarity = paramSlotExprWired(paramLayout, nodeId, 'lacunarity', 0);
        const gain = paramSlotExprWired(paramLayout, nodeId, 'gain', 0);
        const amplitude = paramSlotExprWired(paramLayout, nodeId, 'amplitude', 0);
        const timeSpeed = paramSlotExprWired(paramLayout, nodeId, 'timeSpeed', 0);
        const timeOffset = paramSlotExprWired(paramLayout, nodeId, 'timeOffset', 0);

        requireHelper('displacement-3d', DISPLACEMENT_3D_WGSL_HELPER);

        const t = `((globals.v0.x + ${timeOffset}) * ${timeSpeed})`;
        const samplePos = `((${posIn.code}) * ${scale} + vec3<f32>(0.0, 0.0, ${t}))`;
        const octaveCount = `clamp(i32(floor(${octaves} + 0.5)), 1, 10)`;
        setNodeOut(nodeId, 'out', {
          type: 'vec3<f32>',
          code: `(${amplitude} * displacementValueFbm3d(${samplePos}, ${octaveCount}, ${lacunarity}, ${gain}))`,
        });
        break;
      }
      case 'ether-sdf': {
        const posIn = resolveInputVec3(nodeId, 'position');
        if (!posIn) break;

        const rotSpeedXZ = paramSlotExprWired(paramLayout, nodeId, 'rotSpeedXZ', 0);
        const rotSpeedXY = paramSlotExprWired(paramLayout, nodeId, 'rotSpeedXY', 0);
        const scale = paramSlotExprWired(paramLayout, nodeId, 'scale', 0);
        const timeSpeed = paramSlotExprWired(paramLayout, nodeId, 'timeSpeed', 0);
        const timeOffset = paramSlotExprWired(paramLayout, nodeId, 'timeOffset', 0);
        const wobbleSpeed = paramSlotExprWired(paramLayout, nodeId, 'wobbleSpeed', 0);
        const sineAmp = paramSlotExprWired(paramLayout, nodeId, 'sineAmp', 0);
        const breatheAmount = paramSlotExprWired(paramLayout, nodeId, 'breatheAmount', 0);
        const breatheSpeed = paramSlotExprWired(paramLayout, nodeId, 'breatheSpeed', 0);
        const center = `vec3<f32>(${paramSlotExprWired(paramLayout, nodeId, 'positionX', 0)}, ${paramSlotExprWired(paramLayout, nodeId, 'positionY', 0)}, ${paramSlotExprWired(paramLayout, nodeId, 'positionZ', 0)})`;

        requireHelper(
          'ether-sdf',
          `
fn etherSdfRot2(a: f32) -> mat2x2<f32> {
  let c = cos(a);
  let s = sin(a);
  return mat2x2<f32>(vec2<f32>(c, -s), vec2<f32>(s, c));
}

fn etherSdfMap(pIn: vec3<f32>, t: f32, rotXZ: f32, rotXY: f32, scale: f32, wobble: f32, sineAmp: f32) -> f32 {
  var p = pIn;
  let p_xz = etherSdfRot2(t * rotXZ) * p.xz;
  p = vec3<f32>(p_xz.x, p.y, p_xz.y);
  let p_xy = etherSdfRot2(t * rotXY) * p.xy;
  p = vec3<f32>(p_xy.x, p_xy.y, p.z);
  let q = p * scale + t;
  let radial = length(p + vec3<f32>(sin(t * wobble), 0.0, 0.0)) * log(length(p) + 1.0);
  return radial + sin(q.x + sin(q.z + sin(q.y))) * sineAmp - 1.0;
}
          `
        );

        const t = `(globals.v0.x * ${timeSpeed} + ${timeOffset})`;
        const breathe = `(sin(${t} * ${breatheSpeed}) * ${breatheAmount})`;
        const etherPos = `(${posIn.code} - (${center} + vec3<f32>(0.0, 0.0, ${breathe})))`;
        const d = `etherSdfMap(${etherPos}, ${t}, ${rotSpeedXZ}, ${rotSpeedXY}, ${scale}, ${wobbleSpeed}, ${sineAmp})`;
        setNodeOut(nodeId, 'out', { type: 'f32', code: d });
        break;
      }
      case 'mandelbulb-sdf': {
        const posIn = resolveInputVec3WithFallback(nodeId, 'position', ['positionX', 'positionY', 'positionZ']);
        if (!posIn) break;

        requireHelper('mandelbulb-sdf-core', MANDELBULB_SDF_DISTANCE_FN);

        const power = `clamp(f32(${paramSlotExprWired(paramLayout, nodeId, 'power', 0)}), 2.0, 24.0)`;
        const iterations = `i32(floor(${paramSlotExprWired(paramLayout, nodeId, 'iterations', 0)} + 0.5))`;
        const bailout = paramSlotExprWired(paramLayout, nodeId, 'bailout', 0);
        const deFudge = paramSlotExprWired(paramLayout, nodeId, 'deFudge', 0);
        const hybridMix = paramSlotExprWired(paramLayout, nodeId, 'hybridMix', 0);

        const expr = `mandelbulbSdf_distance(${posIn.code}, ${power}, ${iterations}, ${bailout}, ${deFudge}, ${hybridMix})`;
        setNodeOut(nodeId, 'out', { type: 'f32', code: expr });
        break;
      }
      case 'julia-slab-sdf': {
        const posIn = resolveInputVec3WithFallback(nodeId, 'position', ['positionX', 'positionY', 'positionZ']);
        if (!posIn) break;
        requireHelper('julia-slab-sdf-wgsl-fn', JULIA_SLAB_SDF_WGSL_FN);

        const juliaReal = paramSlotExprWired(paramLayout, nodeId, 'juliaReal', 0);
        const juliaImag = paramSlotExprWired(paramLayout, nodeId, 'juliaImag', 0);
        const slabHalfThickness = paramSlotExprWired(paramLayout, nodeId, 'slabHalfThickness', 0);
        const xyScale = paramSlotExprWired(paramLayout, nodeId, 'xyScale', 0);
        const escapeRadius = paramSlotExprWired(paramLayout, nodeId, 'escapeRadius', 0);
        const maxIter = `i32(floor(${paramSlotExprWired(paramLayout, nodeId, 'maxIter', 0)} + 0.5))`;
        const px = paramSlotExprWired(paramLayout, nodeId, 'positionX', 0);
        const py = paramSlotExprWired(paramLayout, nodeId, 'positionY', 0);
        const pz = paramSlotExprWired(paramLayout, nodeId, 'positionZ', 0);

        const pAdjusted = `((${posIn.code}) - vec3<f32>(${px}, ${py}, ${pz}))`;
        const expr = `julia_sl_slab_sdf_dist(${pAdjusted}, vec2<f32>(${juliaReal}, ${juliaImag}), ${xyScale}, ${escapeRadius}, ${maxIter}, ${slabHalfThickness})`;
        setNodeOut(nodeId, 'out', { type: 'f32', code: expr });
        break;
      }
      case 'kifs-sdf': {
        const posIn = resolveInputVec3WithFallback(nodeId, 'position', ['positionX', 'positionY', 'positionZ']);
        if (!posIn) break;

        requireHelper('sdf-axis-quat-wgsl-shared', SDF_AXIS_QUAT_MAT3_WGSL);
        requireHelper('kifs-sdf-distance-wgsl', KIFS_SDF_DISTANCE_WGSL);

        const kScale = paramSlotExprWired(paramLayout, nodeId, 'scale', 0);
        const kOffset = `vec3<f32>(${paramSlotExprWired(paramLayout, nodeId, 'offsetX', 0)}, ${paramSlotExpr(
          paramLayout,
          nodeId,
          'offsetY',
          0,
        )}, ${paramSlotExprWired(paramLayout, nodeId, 'offsetZ', 0)})`;
        const kAx = paramSlotExprWired(paramLayout, nodeId, 'rotationAxisX', 0);
        const kAy = paramSlotExprWired(paramLayout, nodeId, 'rotationAxisY', 0);
        const kAz = paramSlotExprWired(paramLayout, nodeId, 'rotationAxisZ', 0);
        const kAng = paramSlotExprWired(paramLayout, nodeId, 'rotationAngle', 0);
        const kRot = `sdf_axis_angle_to_mat3(vec3<f32>(${kAx}, ${kAy}, ${kAz}), ${kAng})`;
        const kIters = `i32(floor(${paramSlotExprWired(paramLayout, nodeId, 'iterations', 0)} + 0.5))`;
        const kRad = paramSlotExprWired(paramLayout, nodeId, 'sphereRadius', 0);

        const expr = `kifs_sdf_distance(${posIn.code}, ${kScale}, ${kOffset}, ${kRot}, ${kIters}, ${kRad})`;
        setNodeOut(nodeId, 'out', { type: 'f32', code: expr });
        break;
      }
      case 'mandelbox-sdf': {
        const posIn = resolveInputVec3WithFallback(nodeId, 'position', ['positionX', 'positionY', 'positionZ']);
        if (!posIn) break;

        requireHelper('sdf-axis-quat-wgsl-shared', SDF_AXIS_QUAT_MAT3_WGSL);
        requireHelper('mandelbox-sdf-eval-wgsl', MANDELBOX_SDF_EVAL_WGSL);

        const scale = paramSlotExprWired(paramLayout, nodeId, 'scale', 0);
        const foldingLimit = paramSlotExprWired(paramLayout, nodeId, 'foldingLimit', 0);
        const minRadius = paramSlotExprWired(paramLayout, nodeId, 'minRadius', 0);
        const iterationsMb = `i32(floor(${paramSlotExprWired(paramLayout, nodeId, 'iterations', 0)} + 0.5))`;
        const offset = `vec3<f32>(${paramSlotExprWired(paramLayout, nodeId, 'offsetX', 0)}, ${paramSlotExprWired(paramLayout, nodeId, 'offsetY', 0)}, ${paramSlotExprWired(paramLayout, nodeId, 'offsetZ', 0)})`;
        const rAxisMx = paramSlotExprWired(paramLayout, nodeId, 'rotationAxisX', 0);
        const rAxisMy = paramSlotExprWired(paramLayout, nodeId, 'rotationAxisY', 0);
        const rAxisMz = paramSlotExprWired(paramLayout, nodeId, 'rotationAxisZ', 0);
        const rAngle = paramSlotExprWired(paramLayout, nodeId, 'rotationAngle', 0);
        const rotMb = `sdf_axis_angle_to_mat3(vec3<f32>(${rAxisMx}, ${rAxisMy}, ${rAxisMz}), ${rAngle})`;
        const deFudgeMb = paramSlotExprWired(paramLayout, nodeId, 'deFudge', 0);

        const expr = `mandelbox_sdf_distance(${posIn.code}, ${scale}, ${foldingLimit}, ${minRadius}, ${iterationsMb}, ${offset}, ${rotMb}, ${deFudgeMb})`;
        setNodeOut(nodeId, 'out', { type: 'f32', code: expr });
        break;
      }
      case 'menger-sponge-sdf': {
        const posIn = resolveInputVec3WithFallback(nodeId, 'position', ['positionX', 'positionY', 'positionZ']);
        if (!posIn) break;

        requireHelper('sdf-axis-quat-wgsl-shared', SDF_AXIS_QUAT_MAT3_WGSL);
        requireHelper('menger-sponge-sdf-dist-wgsl', MENGER_SPONGE_SDF_WGSL);

        const off = `vec3<f32>(${paramSlotExprWired(paramLayout, nodeId, 'offsetX', 0)}, ${paramSlotExprWired(paramLayout, nodeId, 'offsetY', 0)}, ${paramSlotExprWired(paramLayout, nodeId, 'offsetZ', 0)})`;
        const sax = paramSlotExprWired(paramLayout, nodeId, 'rotationAxisX', 0);
        const say = paramSlotExprWired(paramLayout, nodeId, 'rotationAxisY', 0);
        const saz = paramSlotExprWired(paramLayout, nodeId, 'rotationAxisZ', 0);
        const sAngle = paramSlotExprWired(paramLayout, nodeId, 'rotationAngle', 0);
        const mRot = `sdf_axis_angle_to_mat3(vec3<f32>(${sax}, ${say}, ${saz}), ${sAngle})`;
        const domainScale = paramSlotExprWired(paramLayout, nodeId, 'domainScale', 0);
        const innerP = `(${mRot} * ((${posIn.code}) + ${off})) * ${domainScale}`;
        const itersMg = `i32(floor(${paramSlotExprWired(paramLayout, nodeId, 'iterations', 0)} + 0.5))`;
        const wallThickness = paramSlotExprWired(paramLayout, nodeId, 'wallThickness', 0);
        const deMul = paramSlotExprWired(paramLayout, nodeId, 'deFudge', 0);

        const expr = `mer_sponge_distance(${innerP}, ${itersMg}, ${wallThickness}, ${deMul})`;
        setNodeOut(nodeId, 'out', { type: 'f32', code: expr });
        break;
      }
      case 'sierpinski-tetra-sdf': {
        const posIn = resolveInputVec3WithFallback(nodeId, 'position', ['positionX', 'positionY', 'positionZ']);
        if (!posIn) break;

        requireHelper('sdf-axis-quat-wgsl-shared', SDF_AXIS_QUAT_MAT3_WGSL);
        requireHelper('sierpinski-tetra-sdf-wgsl', SIERPINSKI_TETRA_SDF_WGSL);

        const offsetSt = `vec3<f32>(${paramSlotExprWired(paramLayout, nodeId, 'offsetX', 0)}, ${paramSlotExprWired(paramLayout, nodeId, 'offsetY', 0)}, ${paramSlotExprWired(paramLayout, nodeId, 'offsetZ', 0)})`;
        const stAxisX = paramSlotExprWired(paramLayout, nodeId, 'rotationAxisX', 0);
        const stAxisY = paramSlotExprWired(paramLayout, nodeId, 'rotationAxisY', 0);
        const stAxisZ = paramSlotExprWired(paramLayout, nodeId, 'rotationAxisZ', 0);
        const tAngle = paramSlotExprWired(paramLayout, nodeId, 'rotationAngle', 0);
        const stM = `sdf_axis_angle_to_mat3(vec3<f32>(${stAxisX}, ${stAxisY}, ${stAxisZ}), ${tAngle})`;
        const scaleSt = paramSlotExprWired(paramLayout, nodeId, 'scale', 0);
        const itersSt = `i32(floor(${paramSlotExprWired(paramLayout, nodeId, 'iterations', 0)} + 0.5))`;
        const coreRadius = paramSlotExprWired(paramLayout, nodeId, 'coreRadius', 0);
        const deBias = paramSlotExprWired(paramLayout, nodeId, 'deBias', 0);

        const expr = `ster_tetra_distance((${posIn.code}), ${stM}, ${scaleSt}, ${offsetSt}, ${itersSt}, ${coreRadius}, ${deBias})`;
        setNodeOut(nodeId, 'out', { type: 'f32', code: expr });
        break;
      }
      case 'stripes': {
        const uvIn = resolveInputVec2(nodeId, 'in');
        if (!uvIn) break;

        const timeLinked = tryResolveInputF32(nodeId, 'time');
        const timeBaseCode = timeLinked ? timeLinked.code : 'globals.v0.x';

        const waveScale = paramSlotExprWired(paramLayout, nodeId, 'waveScale', 0);
        const waveFrequency = paramSlotExprWired(paramLayout, nodeId, 'waveFrequency', 0);
        const waveAmplitude = paramSlotExprWired(paramLayout, nodeId, 'waveAmplitude', 0);
        const waveType = paramSlotExprWired(paramLayout, nodeId, 'waveType', 0);
        const waveDirectionDeg = paramSlotExprWired(paramLayout, nodeId, 'waveDirection', 0);
        const wavePhaseSpeed = paramSlotExprWired(paramLayout, nodeId, 'wavePhaseSpeed', 0);
        const wavePhaseOffset = paramSlotExprWired(paramLayout, nodeId, 'wavePhaseOffset', 0);
        const waveTimeSpeed = paramSlotExprWired(paramLayout, nodeId, 'waveTimeSpeed', 0);
        const waveIntensity = paramSlotExprWired(paramLayout, nodeId, 'waveIntensity', 0);
        const waveTimeOffset = paramSlotExprWired(paramLayout, nodeId, 'waveTimeOffset', 0);

        requireHelper('wgslMod', WGSL_HELPER_WGSL_MOD);
        requireHelper('rotate2', WGSL_HELPER_ROTATE2);
        requireHelper(
          'stripes-wave',
          `
fn wavePatternStripes(p: vec2<f32>, frequency: f32, amplitude: f32, phase: f32, waveType: f32) -> f32 {
  let x = p.x * frequency + phase;
  let vSine = sin(x) * amplitude;
  let vCos = cos(x) * amplitude;
  let vSquare = sign(sin(x)) * amplitude;
  let vTri = abs(wgslMod(x, 2.0) - 1.0) * amplitude * 2.0 - amplitude;

  let is0 = waveType < 0.5;
  let is1 = waveType >= 0.5 && waveType < 1.5;
  let is2 = waveType >= 1.5 && waveType < 2.5;
  let is3 = waveType >= 2.5;

  let v =
    vSine * select(0.0, 1.0, is0) +
    vCos * select(0.0, 1.0, is1) +
    vSquare * select(0.0, 1.0, is2) +
    vTri * select(0.0, 1.0, is3);

  return v * 0.5 + 0.5;
}
          `
        );

        const waveTime = `((${timeBaseCode} + ${waveTimeOffset}) * ${waveTimeSpeed})`;
        const wavePhase = `(${waveTime} * ${wavePhaseSpeed} + ${wavePhaseOffset})`;
        const ang = `(${waveDirectionDeg} * 3.14159 / 180.0)`;
        const p = `rotate2(${uvIn.code}, ${ang})`;
        const waveVal = `wavePatternStripes(${p} * ${waveScale}, ${waveFrequency}, ${waveAmplitude}, ${wavePhase}, ${waveType})`;
        setNodeOut(nodeId, 'out', { type: 'f32', code: `(${waveVal} * ${waveIntensity})` });
        break;
      }
      case 'dots': {
        const pIn = resolveInputVec2(nodeId, 'in');
        if (!pIn) break;

        const spacing = paramSlotExprWired(paramLayout, nodeId, 'dotsSpacing', 0);
        const size = paramSlotExprWired(paramLayout, nodeId, 'dotsSize', 0);
        const feather = paramSlotExprWired(paramLayout, nodeId, 'dotsFeather', 0);
        const intensity = paramSlotExprWired(paramLayout, nodeId, 'dotsIntensity', 0);

        requireHelper(
          'dots',
          `
fn dotsPattern(p: vec2<f32>, periodUv: f32, dotRadiusWorld: f32, featherUv: f32) -> f32 {
  let period = max(1e-5, periodUv);
  let cell = fract(p / period);
  let center = vec2<f32>(0.5, 0.5);
  let dist = length(cell - center);
  let radiusCell = dotRadiusWorld / period;
  let featherCell = featherUv / period;
  return 1.0 - smoothstep(radiusCell, radiusCell + featherCell, dist);
}
          `
        );

        const dotVal = `dotsPattern(${pIn.code}, ${spacing}, ${size}, ${feather})`;
        setNodeOut(nodeId, 'out', { type: 'f32', code: `(${dotVal} * ${intensity})` });
        break;
      }
      case 'bokeh': {
        // GLSL-parity single-pass approximation from `src/shaders/nodes/bokeh.ts` (not the multipass
        // `pass.bokeh.v1` plan used when `bokeh.out → final-output.in`).
        const cIn = resolveInputVec4(nodeId, 'in');
        if (!cIn) break;

        const threshold = paramSlotExprWired(paramLayout, nodeId, 'bokehThreshold', 0);
        const intensity = paramSlotExprWired(paramLayout, nodeId, 'bokehIntensity', 0);
        const radius = paramSlotExprWired(paramLayout, nodeId, 'bokehRadius', 0);
        const strength = paramSlotExprWired(paramLayout, nodeId, 'bokehStrength', 0);
        const blades = paramSlotExprWired(paramLayout, nodeId, 'bokehBlades', 0);
        const rotation = paramSlotExprWired(paramLayout, nodeId, 'bokehRotation', 0);

        requireHelper(
          'bokeh',
          `
fn bokehBright(v: f32, threshold: f32, intensity: f32) -> f32 {
  return max(0.0, v - threshold) * intensity;
}
          `
        );

        const aspect = `(globals.v0.z / max(1.0, globals.v0.w))`;
        const pc = `((in.uv * 2.0 - vec2<f32>(1.0, 1.0)) * vec2<f32>(${aspect}, 1.0))`;
        const color = `${cIn.code}.xyz`;
        const lum = `dot(${color}, vec3<f32>(0.2126, 0.7152, 0.0722))`;
        const bladesF = `max(3.0, ${blades})`;
        const a = `(atan2((${pc}).y, (${pc}).x) + radians(${rotation}))`;
        const irisMod = `clamp(0.55 + 0.45 * abs(cos(${bladesF} * ${a})), 0.2, 1.4)`;
        const b = `(bokehBright(${lum}, ${threshold}, ${intensity}) * ${irisMod} * clamp(1.05 + ${radius} * 0.012, 0.5, 1.8))`;
        const blended = `(${lum} + ${b} * ${strength})`;
        const rgb = `select(vec3<f32>(${blended}), clamp(${color} * (${blended} / max(${lum}, 1e-4)), vec3<f32>(0.0), vec3<f32>(1.0)), ${lum} > 1e-4)`;
        setNodeOut(nodeId, 'out', {
          type: 'vec4<f32>',
          code: `vec4<f32>(${rgb}, (${cIn.code}).w)`,
        });
        break;
      }
      case 'blur': {
        // GLSL-parity luminance soften from `src/shaders/nodes/blur.ts` (not the multipass
        // `pass.blur.gaussian-separable.v1` plan used when `blur.out → final-output.in`).
        const cIn = resolveInputVec4(nodeId, 'in');
        if (!cIn) break;

        const blurAmount = paramSlotExprWired(paramLayout, nodeId, 'blurAmount', 0);
        const blurRadius = paramSlotExprWired(paramLayout, nodeId, 'blurRadius', 0);
        const blurType = paramSlotExprWired(paramLayout, nodeId, 'blurType', 0);
        const blurDirection = paramSlotExprWired(paramLayout, nodeId, 'blurDirection', 0);
        const blurCenterX = paramSlotExprWired(paramLayout, nodeId, 'blurCenterX', 0);
        const blurCenterY = paramSlotExprWired(paramLayout, nodeId, 'blurCenterY', 0);

        const aspect = `(globals.v0.z / max(1.0, globals.v0.w))`;
        const pc = `((in.uv * 2.0 - vec2<f32>(1.0, 1.0)) * vec2<f32>(${aspect}, 1.0))`;
        const color = `${cIn.code}.xyz`;
        const lum = `dot(${color}, vec3<f32>(0.2126, 0.7152, 0.0722))`;
        const userAmt = `clamp(${blurAmount}, 0.0, 1.0)`;
        const radScale = `clamp(${blurRadius} / 20.0, 0.0, 1.0)`;
        const amt = `(${userAmt} * ${radScale})`;
        const typeF = `f32(${blurType})`;
        const cen = `vec2<f32>(${blurCenterX}, ${blurCenterY})`;
        const ang = `(${blurDirection} * 3.141592653589793 / 180.0)`;
        const blurAxis = `vec2<f32>(cos(${ang}), sin(${ang}))`;
        const ani = `clamp(0.45 + pow(abs(dot(${pc}, ${blurAxis})), 2.0), 0.35, 1.35)`;
        const radial = `clamp(1.1 - length(${pc} - ${cen}) * 0.08, 0.25, 1.25)`;
        const wDir = `(${amt} * ${ani})`;
        const wRad = `(${amt} * ${radial})`;
        const inner = `select(${amt}, ${wDir}, (${typeF} > 0.5) && (${typeF} < 1.5))`;
        const w = `select(${inner}, ${wRad}, ${typeF} >= 1.5)`;
        const wClamped = `clamp(${w}, 0.0, 1.0)`;
        const softened = `(${lum} * (1.0 - ${wClamped}) + 0.5 * ${wClamped})`;
        const rgb = `select(vec3<f32>(${softened}), clamp(${color} * (${softened} / max(${lum}, 1e-4)), vec3<f32>(0.0), vec3<f32>(1.0)), ${lum} > 1e-4)`;
        setNodeOut(nodeId, 'out', {
          type: 'vec4<f32>',
          code: `vec4<f32>(${rgb}, (${cIn.code}).w)`,
        });
        break;
      }
      case 'bokeh-point': {
        const ro = resolveInputVec3(nodeId, 'ro');
        const rd = resolveInputVec3(nodeId, 'rd');
        const pt = resolveInputVec3(nodeId, 'point');
        if (!ro || !rd || !pt) break;

        const size = `max(${paramSlotExprWired(paramLayout, nodeId, 'size', 0)}, 0.0001)`;
        const blur = `clamp(${paramSlotExprWired(paramLayout, nodeId, 'blur', 0)}, 0.0, 0.99)`;
        const highQuality = paramSlotExprWired(paramLayout, nodeId, 'highQuality', 0);

        const d = `length(cross(${pt.code} - ${ro.code}, ${rd.code}))`;
        const m0 = `smoothstep(${size}, ${size} * (1.0 - ${blur}), ${d})`;
        const inner = `mix(0.7, 1.0, smoothstep(0.8 * ${size}, ${size}, ${d}))`;
        const m = `(${m0} * select(1.0, ${inner}, ${highQuality} > 0.5))`;
        setNodeOut(nodeId, 'out', { type: 'f32', code: m });
        break;
      }
      case 'sky-dome': {
        // Fixture-friendly fallback: if unconnected, use fullscreen UV (semantic default,
        // not the GLSL-parity vec2(0.0)). `tryResolveInputVec2` returns null when unconnected.
        const uvIn = tryResolveInputVec2(nodeId, 'in') ?? { type: 'vec2<f32>' as const, code: 'in.uv' };

        const zenithL = paramSlotExprWired(paramLayout, nodeId, 'zenithL', 0);
        const zenithC = paramSlotExprWired(paramLayout, nodeId, 'zenithC', 0);
        const zenithH = paramSlotExprWired(paramLayout, nodeId, 'zenithH', 0);
        const horizonL = paramSlotExprWired(paramLayout, nodeId, 'horizonL', 0);
        const horizonC = paramSlotExprWired(paramLayout, nodeId, 'horizonC', 0);
        const horizonH = paramSlotExprWired(paramLayout, nodeId, 'horizonH', 0);
        const horizonSharpness = paramSlotExprWired(paramLayout, nodeId, 'horizonSharpness', 0);
        const sunDirX = paramSlotExprWired(paramLayout, nodeId, 'sunDirX', 0);
        const sunDirY = paramSlotExprWired(paramLayout, nodeId, 'sunDirY', 0);
        const sunDirZ = paramSlotExprWired(paramLayout, nodeId, 'sunDirZ', 0);
        const sunRadius = `max(${paramSlotExprWired(paramLayout, nodeId, 'sunRadius', 0)}, 0.000001)`;
        const sunIntensity = paramSlotExprWired(paramLayout, nodeId, 'sunIntensity', 0);
        const fov = paramSlotExprWired(paramLayout, nodeId, 'fov', 0);
        const viewYaw = paramSlotExprWired(paramLayout, nodeId, 'viewYaw', 0);
        const viewPitch = paramSlotExprWired(paramLayout, nodeId, 'viewPitch', 0);
        const viewRoll = paramSlotExprWired(paramLayout, nodeId, 'viewRoll', 0);

        requireHelper(
          'sky-dome',
          `
fn skyDomeOklchToRgb(oklch: vec3<f32>) -> vec3<f32> {
  let l = oklch.x;
  let c = oklch.y;
  let h = oklch.z * 3.14159265359 / 180.0;
  let a_ = c * cos(h);
  let b_ = c * sin(h);
  let l_ = l + 0.3963377774 * a_ + 0.2158037573 * b_;
  let m_ = l - 0.1055613458 * a_ - 0.0638541728 * b_;
  let s_ = l - 0.0894841775 * a_ - 1.2914855480 * b_;
  let l3 = l_ * l_ * l_;
  let m3 = m_ * m_ * m_;
  let s3 = s_ * s_ * s_;
  let r =  4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3;
  let g = -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3;
  let bl = -0.0041960863 * l3 - 0.7034186147 * m3 + 1.7076147010 * s3;
  return clamp(vec3<f32>(r, g, bl), vec3<f32>(0.0), vec3<f32>(1.0));
}

fn skyDomeRayDir(uv: vec2<f32>, fov: f32, yawDeg: f32, pitchDeg: f32, rollDeg: f32) -> vec3<f32> {
  let halfFov = radians(fov) * 0.5;
  let t = tan(halfFov);
  let ndc = (uv * 2.0 - vec2<f32>(1.0)) * t;
  let baseDir = normalize(vec3<f32>(ndc, -1.0));

  let yawR = radians(yawDeg);
  let pitchR = radians(pitchDeg);
  let rollR = radians(rollDeg);
  let cy = cos(yawR);
  let sy = sin(yawR);
  let cp = cos(pitchR);
  let sp = sin(pitchR);
  let cr = cos(rollR);
  let sr = sin(rollR);

  let r1 = vec3<f32>(cr * baseDir.x - sr * baseDir.y,
                     sr * baseDir.x + cr * baseDir.y,
                     baseDir.z);
  let r2 = vec3<f32>(r1.x,
                     cp * r1.y - sp * r1.z,
                     sp * r1.y + cp * r1.z);
  return vec3<f32>(cy * r2.x - sy * r2.z,
                   r2.y,
                   sy * r2.x + cy * r2.z);
}
          `
        );

        const rayDir = `skyDomeRayDir((${uvIn.code}), ${fov}, ${viewYaw}, ${viewPitch}, ${viewRoll})`;
        const elevation = `asin(clamp((${rayDir}).y, -1.0, 1.0))`;
        const edge0 = `(-0.1 * ${horizonSharpness})`;
        const edge1 = `(0.5 * ${horizonSharpness})`;
        const t = `smoothstep(${edge0}, ${edge1}, ${elevation})`;
        const zenith = `skyDomeOklchToRgb(vec3<f32>(${zenithL}, ${zenithC}, ${zenithH}))`;
        const horizon = `skyDomeOklchToRgb(vec3<f32>(${horizonL}, ${horizonC}, ${horizonH}))`;
        const baseSky = `mix(${horizon}, ${zenith}, ${t})`;

        const sunDirRaw = `vec3<f32>(${sunDirX}, ${sunDirY}, ${sunDirZ})`;
        const sunDir = `select(vec3<f32>(0.0, 1.0, 0.0), normalize(${sunDirRaw}), length(${sunDirRaw}) > 0.001)`;
        const angleToSun = `acos(clamp(dot(${rayDir}, ${sunDir}), -1.0, 1.0))`;
        const sunFalloff = `select(0.0, (1.0 - smoothstep(0.0, 1.0, ${angleToSun} / ${sunRadius})), ${angleToSun} < ${sunRadius})`;
        const sky = `(${baseSky} + ${sunIntensity} * ${sunFalloff})`;

        setNodeOut(nodeId, 'out', { type: 'vec4<f32>', code: `vec4<f32>(${sky}, 1.0)` });
        break;
      }
      case 'lighting-shading': {
        const inV = resolveInputVec4(nodeId, 'in');
        if (!inV) break;

        const lightType = paramSlotExprWired(paramLayout, nodeId, 'lightType', 0);
        const lightDirX = paramSlotExprWired(paramLayout, nodeId, 'lightDirX', 0);
        const lightDirY = paramSlotExprWired(paramLayout, nodeId, 'lightDirY', 0);
        const lightDirZ = paramSlotExprWired(paramLayout, nodeId, 'lightDirZ', 0);
        const lightPosX = paramSlotExprWired(paramLayout, nodeId, 'lightPosX', 0);
        const lightPosY = paramSlotExprWired(paramLayout, nodeId, 'lightPosY', 0);
        const lightPosZ = paramSlotExprWired(paramLayout, nodeId, 'lightPosZ', 0);
        const lightIntensity = paramSlotExprWired(paramLayout, nodeId, 'lightIntensity', 0);
        const lightAmbient = paramSlotExprWired(paramLayout, nodeId, 'lightAmbient', 0);
        const lightFalloff = paramSlotExprWired(paramLayout, nodeId, 'lightFalloff', 0);
        const lightColorR = paramSlotExprWired(paramLayout, nodeId, 'lightColorR', 0);
        const lightColorG = paramSlotExprWired(paramLayout, nodeId, 'lightColorG', 0);
        const lightColorB = paramSlotExprWired(paramLayout, nodeId, 'lightColorB', 0);

        const aspect = `(globals.v0.z / max(1.0, globals.v0.w))`;
        const p = `((in.uv * 2.0 - vec2<f32>(1.0, 1.0)) * vec2<f32>(${aspect}, 1.0))`;

        requireHelper(
          'lighting-shading',
          `
fn lsDirectionalLight(normal: vec3<f32>, lightDir: vec3<f32>) -> f32 {
  return max(dot(normal, normalize(lightDir)), 0.0);
}

fn lsPointLight(p: vec3<f32>, lightPos: vec3<f32>, intensity: f32, falloff: f32) -> f32 {
  let toLight = lightPos - p;
  let dist = length(toLight);
  let attenuation = intensity / max(1.0 + falloff * dist * dist, 0.001);
  return attenuation;
}

fn lsSurfaceNormal(p: vec2<f32>) -> vec3<f32> {
  let gradient = length(p) * 0.1;
  return normalize(vec3<f32>(p.x * gradient, p.y * gradient, 1.0));
}
          `
        );

        const srcColor = `(${inV.code}).xyz`;
        const lum = `dot(${srcColor}, vec3<f32>(0.2126, 0.7152, 0.0722))`;
        const lightColor = `vec3<f32>(${lightColorR}, ${lightColorG}, ${lightColorB})`;

        const lightDirVec = `vec3<f32>(${lightDirX}, ${lightDirY}, ${lightDirZ})`;
        const lightDir = `select(vec3<f32>(0.0, 0.0, 1.0), normalize(${lightDirVec}), length(${lightDirVec}) > 0.001)`;
        const normal = `lsSurfaceNormal(${p})`;
        const directional = `lsDirectionalLight(${normal}, ${lightDir})`;

        const lightPos = `vec3<f32>(${lightPosX}, ${lightPosY}, ${lightPosZ})`;
        const point = `lsPointLight(vec3<f32>(${p}, 0.0), ${lightPos}, ${lightIntensity}, ${lightFalloff})`;

        const isDirectional = `(${lightType} < 0.5)`;
        const lighting = `select(${point}, ${directional}, ${isDirectional})`;

        const shadedLum = `((${lum}) * (${lightAmbient} + ${lighting} * ${lightIntensity}))`;
        const ratio = `(${shadedLum} / max(${lum}, 1e-4))`;
        const rgb = `(clamp((${lightColor}) * ${srcColor} * ${ratio}, vec3<f32>(0.0), vec3<f32>(1.0)))`;
        const tintOnly = `((${lightColor}) * ${shadedLum})`;
        const safeRgb = `(select(${tintOnly}, ${rgb}, (${lum}) > 1e-4))`;
        setNodeOut(nodeId, 'out', { type: 'vec4<f32>', code: `vec4<f32>(${safeRgb}, (${inV.code}).w)` });
        break;
      }
      case 'normal-mapping': {
        const inV = resolveInputVec4(nodeId, 'in');
        if (!inV) break;

        const normalScale = paramSlotExprWired(paramLayout, nodeId, 'normalScale', 0);
        const normalStrength = paramSlotExprWired(paramLayout, nodeId, 'normalStrength', 0);
        const normalLightX = paramSlotExprWired(paramLayout, nodeId, 'normalLightX', 0);
        const normalLightY = paramSlotExprWired(paramLayout, nodeId, 'normalLightY', 0);
        const normalLightZ = paramSlotExprWired(paramLayout, nodeId, 'normalLightZ', 0);

        const aspect = `(globals.v0.z / max(1.0, globals.v0.w))`;
        const p = `((in.uv * 2.0 - vec2<f32>(1.0, 1.0)) * vec2<f32>(${aspect}, 1.0))`;

        requireHelper(
          'normal-mapping',
          `
fn nmCalculateNormalScaled(p_scaled: vec2<f32>, scale_mul: f32, lumAmt: f32) -> vec3<f32> {
  let amp = (0.12 + lumAmt) * scale_mul;
  return normalize(vec3<f32>(-p_scaled.x * amp, -p_scaled.y * amp, 1.0));
}

fn nmApply(baseValue: f32, normal: vec3<f32>, lightDir: vec3<f32>) -> f32 {
  let l = select(vec3<f32>(0.0, 0.0, 1.0), normalize(lightDir), length(lightDir) > 0.001);
  let lighting = max(dot(normal, l), 0.0);
  return baseValue * (0.5 + 0.5 * lighting);
}
          `
        );

        const color = `(${inV.code}).xyz`;
        const lum = `dot(${color}, vec3<f32>(0.2126, 0.7152, 0.0722))`;
        const lightDir = `vec3<f32>(${normalLightX}, ${normalLightY}, ${normalLightZ})`;
        const pScaled = `(${p} * ${normalScale})`;
        const normal = `nmCalculateNormalScaled(${pScaled}, ${normalScale}, ${lum})`;
        const normalEffect = `nmApply(${lum}, ${normal}, ${lightDir})`;
        const mixedLum = `mix(${lum}, ${normalEffect}, clamp(${normalStrength}, 0.0, 1.0))`;
        const ratio = `(${mixedLum} / max(${lum}, 1e-4))`;
        const scaled = `clamp(${color} * ${ratio}, vec3<f32>(0.0), vec3<f32>(1.0))`;
        const safe = `(select(vec3<f32>(${mixedLum}), ${scaled}, (${lum}) > 1e-4))`;
        setNodeOut(nodeId, 'out', { type: 'vec4<f32>', code: `vec4<f32>(${safe}, (${inV.code}).w)` });
        break;
      }
      case 'spherical-fibonacci': {
        const dirIn = resolveInputVec3WithFallback(nodeId, 'direction', ['directionX', 'directionY', 'directionZ']);
        const idxInRaw = resolveInputF32(nodeId, 'index', 'indexInput');
        if (!dirIn || !idxInRaw) break;

        const latticeCount = paramSlotExprWired(paramLayout, nodeId, 'latticeCount', 0);

        requireHelper(
          'spherical-fibonacci',
          `
const SF_GOLDEN: f32 = 1.618033988749895;
const SF_PI: f32 = 3.141592653589793;

fn sfId2Dir(i: f32, n: f32) -> vec3<f32> {
  let nf = max(n, 2.0);
  var z = 1.0 - (2.0 * i + 1.0) / nf;
  z = clamp(z, -1.0, 1.0);
  let phi = 2.0 * SF_PI * fract(i / SF_GOLDEN);
  let r = sqrt(max(0.0, 1.0 - z * z));
  return vec3<f32>(r * cos(phi), r * sin(phi), z);
}

fn sfDir2Id(dir: vec3<f32>, n: f32) -> f32 {
  let nf = max(n, 2.0);
  let d = select(vec3<f32>(0.0, 0.0, 1.0), normalize(dir), length(dir) > 0.001);
  let z = clamp(d.z, -1.0, 1.0);
  let iCont = (1.0 - z) * nf * 0.5 - 0.5;
  let iCenter = i32(round(iCont));
  var bestDot = -2.0;
  var bestI = 0.0;
  for (var o: i32 = -2; o <= 2; o = o + 1) {
    let k = iCenter + o;
    if (k < 0) { continue; }
    let ik = f32(k);
    if (ik >= nf) { break; }
    let dotK = dot(d, sfId2Dir(ik, nf));
    if (dotK > bestDot) {
      bestDot = dotK;
      bestI = ik;
    }
  }
  return bestI;
}
          `
        );

        const n = `min(max(f32(${latticeCount}), 2.0), 4096.0)`;
        const dirNorm = `select(vec3<f32>(0.0, 0.0, 1.0), normalize(${dirIn.code}), length(${dirIn.code}) > 0.001)`;
        const idxIn = `floor(clamp(${idxInRaw.code}, 0.0, ${n} - 1.0))`;

        const outIdx = `sfDir2Id(${dirNorm}, ${n})`;
        const outDir = `sfId2Dir(${idxIn}, ${n})`;
        const outNearest = `sfId2Dir(round(${outIdx}), ${n})`;

        setNodeOut(nodeId, 'index', { type: 'f32', code: outIdx });
        setNodeOut(nodeId, 'direction', { type: 'vec3<f32>', code: outDir });
        setNodeOut(nodeId, 'nearestPoint', { type: 'vec3<f32>', code: outNearest });
        break;
      }
      case 'bloom-sphere': {
        const pIn = resolveInputVec2(nodeId, 'in');
        if (!pIn) break;

        const mode = paramSlotExprWired(paramLayout, nodeId, 'mode', 0);
        const bloomCenterX = paramSlotExprWired(paramLayout, nodeId, 'bloomCenterX', 0);
        const bloomCenterY = paramSlotExprWired(paramLayout, nodeId, 'bloomCenterY', 0);
        const sphereRadius = `max(${paramSlotExprWired(paramLayout, nodeId, 'sphereRadius', 0)}, 0.0001)`;
        const spotCount = paramSlotExprWired(paramLayout, nodeId, 'spotCount', 0);
        const baseSpotAngle = paramSlotExprWired(paramLayout, nodeId, 'baseSpotAngle', 0);
        const waveSpeed = paramSlotExprWired(paramLayout, nodeId, 'waveSpeed', 0);
        const wavePhase = paramSlotExprWired(paramLayout, nodeId, 'wavePhase', 0);
        const waveDetuneFreq = paramSlotExprWired(paramLayout, nodeId, 'waveDetuneFreq', 0);
        const waveDetuneAmp = paramSlotExprWired(paramLayout, nodeId, 'waveDetuneAmp', 0);
        const indexPhaseScale = paramSlotExprWired(paramLayout, nodeId, 'indexPhaseScale', 0);
        const latticeSpinSpeed = paramSlotExprWired(paramLayout, nodeId, 'latticeSpinSpeed', 0);
        const waveAmplitude = paramSlotExprWired(paramLayout, nodeId, 'waveAmplitude', 0);
        const spotSoftness = paramSlotExprWired(paramLayout, nodeId, 'spotSoftness', 0);
        const outerL = paramSlotExprWired(paramLayout, nodeId, 'outerL', 0);
        const outerC = paramSlotExprWired(paramLayout, nodeId, 'outerC', 0);
        const outerH = paramSlotExprWired(paramLayout, nodeId, 'outerH', 0);
        const innerL = paramSlotExprWired(paramLayout, nodeId, 'innerL', 0);
        const innerC = paramSlotExprWired(paramLayout, nodeId, 'innerC', 0);
        const innerH = paramSlotExprWired(paramLayout, nodeId, 'innerH', 0);
        const brightness = paramSlotExprWired(paramLayout, nodeId, 'brightness', 0);
        const classicSpotSharpness = paramSlotExprWired(paramLayout, nodeId, 'classicSpotSharpness', 0);
        const classicOuterGlowR = paramSlotExprWired(paramLayout, nodeId, 'classicOuterGlowR', 0);
        const classicOuterGlowG = paramSlotExprWired(paramLayout, nodeId, 'classicOuterGlowG', 0);
        const classicOuterGlowB = paramSlotExprWired(paramLayout, nodeId, 'classicOuterGlowB', 0);
        const classicInnerGlowR = paramSlotExprWired(paramLayout, nodeId, 'classicInnerGlowR', 0);
        const classicInnerGlowG = paramSlotExprWired(paramLayout, nodeId, 'classicInnerGlowG', 0);
        const classicInnerGlowB = paramSlotExprWired(paramLayout, nodeId, 'classicInnerGlowB', 0);

        requireHelper(
          'bloom-sphere',
          `
const BS_GOLDEN: f32 = 1.618033988749895;
const BS_PI: f32 = 3.141592653589793;

fn bloomSphereOklchToRgb(oklch: vec3<f32>) -> vec3<f32> {
  let l = oklch.x;
  let c = oklch.y;
  let h = oklch.z * BS_PI / 180.0;
  let a = c * cos(h);
  let b = c * sin(h);

  let l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  let m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  let s_ = l - 0.0894841775 * a - 1.2914855480 * b;

  let l3 = l_ * l_ * l_;
  let m3 = m_ * m_ * m_;
  let s3 = s_ * s_ * s_;

  let r = 4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3;
  let g = -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3;
  let bl = -0.0041960863 * l3 - 0.7034186147 * m3 + 1.7076147010 * s3;
  return clamp(vec3<f32>(r, g, bl), vec3<f32>(0.0), vec3<f32>(1.0));
}

fn bloomSphereId2Sf(i: f32, n: f32) -> vec3<f32> {
  let nf = max(n, 2.0);
  var z = 1.0 - (2.0 * i + 1.0) / nf;
  z = clamp(z, -1.0, 1.0);
  let phi = 2.0 * BS_PI * fract(i / BS_GOLDEN);
  let r = sqrt(max(0.0, 1.0 - z * z));
  return vec3<f32>(r * cos(phi), r * sin(phi), z);
}

fn bloomSphereSf2Id(dir: vec3<f32>, n: f32) -> f32 {
  let nf = max(n, 2.0);
  let d = select(vec3<f32>(0.0, 0.0, 1.0), normalize(dir), length(dir) > 0.001);
  let z = clamp(d.z, -1.0, 1.0);
  let iCont = (1.0 - z) * nf * 0.5 - 0.5;
  let iCenter = i32(round(iCont));
  var bestDot = -2.0;
  var bestI = 0.0;
  for (var o: i32 = -2; o <= 2; o = o + 1) {
    let k = iCenter + o;
    if (k < 0) { continue; }
    let ik = f32(k);
    if (ik >= nf) { break; }
    let dotK = dot(d, bloomSphereId2Sf(ik, nf));
    if (dotK > bestDot) {
      bestDot = dotK;
      bestI = ik;
    }
  }
  return bestI;
}

fn bloomSphereShadeInside(
  modeClassic: bool,
  N: vec3<f32>,
  nDotV: f32,
  timeSec: f32,
  spotCountRaw: f32,
  baseSpotAngle: f32,
  waveSpeed: f32,
  wavePhase: f32,
  indexPhaseScale: f32,
  waveDetuneFreq: f32,
  waveDetuneAmp: f32,
  latticeSpinSpeed: f32,
  waveAmplitude: f32,
  spotSoftness: f32,
  outerL: f32,
  outerC: f32,
  outerH: f32,
  innerL: f32,
  innerC: f32,
  innerH: f32,
  brightness: f32,
  classicSpotSharpness: f32,
  classicOuterGlowR: f32,
  classicOuterGlowG: f32,
  classicOuterGlowB: f32,
  classicInnerGlowR: f32,
  classicInnerGlowG: f32,
  classicInnerGlowB: f32,
) -> vec4<f32> {
  if (modeClassic) {
    let spinAngle = timeSec * latticeSpinSpeed;
    let spinC = cos(spinAngle);
    let spinS = sin(spinAngle);
    let Nspin = vec3<f32>(spinC * N.x + spinS * N.z, N.y, -spinS * N.x + spinC * N.z);

    let nClassic = clamp(spotCountRaw, 2.0, 4096.0);
    let idx = bloomSphereSf2Id(Nspin, nClassic);
    let nearestDir = bloomSphereId2Sf(round(idx), nClassic);
    let dotN = dot(Nspin, nearestDir);

    let T = timeSec * waveSpeed;
    let idxScale = indexPhaseScale;
    let wPhase = wavePhase;
    let detuneF = waveDetuneFreq;
    let detuneA = clamp(waveDetuneAmp, 0.0, 1.0);

    let spotPhase = T + idx * idxScale + wPhase;
    let waveRaw = sin(spotPhase) + detuneA * sin(T * detuneF + idx * idxScale + wPhase);
    let wave = clamp(0.5 + 0.5 * (waveRaw / (1.0 + detuneA)), 0.0, 1.0);

    let sharp = max(classicSpotSharpness, 1.0);
    var spotMask = smoothstep(1.0 - 1.0 / sharp, 1.0, dotN);
    let amp = clamp(waveAmplitude, 0.0, 1.0);
    let waveMod = (1.0 - amp) + amp * wave;
    spotMask = spotMask * (0.3 + 0.7 * waveMod);

    let outerColor = bloomSphereOklchToRgb(vec3<f32>(outerL, outerC, outerH));
    let innerColor = bloomSphereOklchToRgb(vec3<f32>(innerL, innerC, innerH));
    var col = mix(outerColor, innerColor, wave);
    col = mix(outerColor * 0.2, col, spotMask);
    col = col * brightness;
    return vec4<f32>(clamp(col, vec3<f32>(0.0), vec3<f32>(1.0)), 1.0);
  }

  let nSpots = clamp(spotCountRaw, 16.0, 256.0);
  let baseAngle = baseSpotAngle;
  let waveAmp = waveAmplitude;
  let sharp = max(classicSpotSharpness, 1.0);
  let sharpFactor = 2.0 / sqrt(sharp);
  let soft = max(0.0005, spotSoftness * sharpFactor);
  let T = timeSec * waveSpeed;
  let wPhase = wavePhase;
  let idxScale = indexPhaseScale;
  let detuneF = waveDetuneFreq;
  let detuneA = waveDetuneAmp;
  let spinAngle = timeSec * latticeSpinSpeed;
  let spinC = cos(spinAngle);
  let spinS = sin(spinAngle);

  let outerColor = bloomSphereOklchToRgb(vec3<f32>(outerL, outerC, outerH));
  let innerColor = bloomSphereOklchToRgb(vec3<f32>(innerL, innerC, innerH));

  var acc = vec3<f32>(0.0);
  for (var ii: i32 = 0; ii < 256; ii = ii + 1) {
    let i = f32(ii);
    if (i >= nSpots) { break; }

    var spotDir = bloomSphereId2Sf(i, nSpots);
    spotDir = vec3<f32>(spinC * spotDir.x + spinS * spotDir.z, spotDir.y, -spinS * spotDir.x + spinC * spotDir.z);

    let iphase = i * idxScale;
    let wave = sin(T + iphase + wPhase) + detuneA * sin(T * detuneF + iphase + wPhase);
    let angle = baseAngle + waveAmp * wave;
    let cosAngle = cos(angle);

    let d = dot(N, spotDir);
    let spotMask = smoothstep(cosAngle - soft, cosAngle + soft * 0.5, d);

    let outerBlend = 1.0 - max(0.0, nDotV);
    let innerBlend = max(0.0, nDotV);
    let spotColor = innerColor * innerBlend + outerColor * outerBlend;
    acc = acc + spotMask * spotColor;
  }

  let norm = 8.0 / max(nSpots * 0.1, 1.0);
  let rgb = clamp(acc * norm * brightness, vec3<f32>(0.0), vec3<f32>(1.0));
  return vec4<f32>(rgb, 1.0);
}
          `
        );

        const ndc = `(${pIn.code} - vec2<f32>(${bloomCenterX}, ${bloomCenterY}))`;
        const ro = `vec3<f32>(0.0, 0.0, 3.0)`;
        const rd = `select(vec3<f32>(0.0, 0.0, -1.0), normalize(vec3<f32>(${ndc}, -1.0)), length(vec3<f32>(${ndc}, -1.0)) > 0.001)`;

        const R = sphereRadius;
        const oc = ro;
        const a = `dot(${rd}, ${rd})`;
        const b = `(2.0 * dot(${oc}, ${rd}))`;
        const c = `(dot(${oc}, ${oc}) - ${R} * ${R})`;
        const disc = `(${b} * ${b} - 4.0 * ${a} * ${c})`;

        const t = `((-${b} - sqrt(max(${disc}, 0.0))) / (2.0 * ${a}))`;
        const P = `(${ro} + ${t} * ${rd})`;
        const N = `(${P} / ${R})`;
        const nDotV = `dot(${N}, -${rd})`;

        const inside = `bloomSphereShadeInside(${mode} > 0.5, ${N}, ${nDotV}, globals.v0.x, f32(${spotCount}), ${baseSpotAngle}, ${waveSpeed}, ${wavePhase}, ${indexPhaseScale}, ${waveDetuneFreq}, ${waveDetuneAmp}, ${latticeSpinSpeed}, ${waveAmplitude}, ${spotSoftness}, ${outerL}, ${outerC}, ${outerH}, ${innerL}, ${innerC}, ${innerH}, ${brightness}, ${classicSpotSharpness}, ${classicOuterGlowR}, ${classicOuterGlowG}, ${classicOuterGlowB}, ${classicInnerGlowR}, ${classicInnerGlowG}, ${classicInnerGlowB})`;

        const outside = `vec4<f32>(0.0, 0.0, 0.0, 1.0)`;
        const out = `select(${outside}, ${inside}, ${disc} >= 0.0)`;
        setNodeOut(nodeId, 'out', { type: 'vec4<f32>', code: out });
        break;
      }
      case 'box-torus-sdf': {
        const uvBt = resolveInputVec2(nodeId, 'in');
        if (!uvBt) break;
        const roBt = resolveInputVec3WithFallback(nodeId, 'ro', ['cameraRoX', 'cameraRoY', 'cameraRoZ']);
        if (!roBt) break;

        const rdLinkBt = lookupInputConnection(graph, nodeId, 'rd');
        let rdBt: Expr;
        if (rdLinkBt) {
          const rdOutBt = resolveNodeOut(rdLinkBt.sourceNodeId, rdLinkBt.sourcePort);
          if (!rdOutBt) break;
          const rdCoercedBt = coerceToType(rdOutBt, 'vec3<f32>');
          if (!rdCoercedBt) break;
          rdBt = rdCoercedBt;
        } else {
          rdBt = { type: 'vec3<f32>', code: `normalize(vec3<f32>(${uvBt.code}, -1.0))` };
        }

        requireHelper('box-torus-sdf-wgsl', BOX_TORUS_SDF_WGSL);

        const primBtStandalone = `clamp(i32(floor(${paramSlotExprWired(paramLayout, nodeId, 'primitiveType', 0)} + 0.5)), i32(0), i32(7))`;
        const cenBtStandalone = `vec3<f32>(${paramSlotExprWired(paramLayout, nodeId, 'primitiveCenterX', 0)}, ${paramSlotExprWired(
          paramLayout,
          nodeId,
          'primitiveCenterY',
          0,
        )}, ${paramSlotExprWired(paramLayout, nodeId, 'primitiveCenterZ', 0)})`;
        const sceneBtStandalone = `BoxTorusSdfSceneParams(${primBtStandalone}, ${cenBtStandalone}, ${paramSlotExprWired(paramLayout, nodeId, 'primitiveRotationX', 0)}, ${paramSlotExprWired(
          paramLayout,
          nodeId,
          'primitiveRotationY',
          0,
        )}, ${paramSlotExprWired(paramLayout, nodeId, 'primitiveRotationZ', 0)}, ${paramSlotExprWired(
          paramLayout,
          nodeId,
          'primitiveSizeX',
          0,
        )}, ${paramSlotExprWired(paramLayout, nodeId, 'primitiveSizeY', 0)}, ${paramSlotExprWired(paramLayout, nodeId, 'primitiveSizeZ', 0)})`;

        const outBt = `boxTorusSdf_standalone_pixel(${uvBt.code}, ${roBt.code}, ${rdBt.code}, ${sceneBtStandalone}, ${paramSlotExprWired(paramLayout, nodeId, 'primitiveRaymarchSteps', 0)}, ${paramSlotExprWired(paramLayout, nodeId, 'primitiveGlowIntensity', 0)}, i32(floor(${paramSlotExprWired(
          paramLayout,
          nodeId,
          'mode',
          0,
        )} + 0.5)), vec3<f32>(${paramSlotExprWired(paramLayout, nodeId, 'lightDirX', 0)}, ${paramSlotExprWired(
          paramLayout,
          nodeId,
          'lightDirY',
          0,
        )}, ${paramSlotExprWired(paramLayout, nodeId, 'lightDirZ', 0)}), vec3<f32>(${paramSlotExprWired(
          paramLayout,
          nodeId,
          'lightPosX',
          0,
        )}, ${paramSlotExprWired(paramLayout, nodeId, 'lightPosY', 0)}, ${paramSlotExprWired(
          paramLayout,
          nodeId,
          'lightPosZ',
          0,
        )}), ${paramSlotExprWired(paramLayout, nodeId, 'lightIntensity', 0)}, ${paramSlotExprWired(
          paramLayout,
          nodeId,
          'lightAmbient',
          0,
        )}, ${paramSlotExprWired(paramLayout, nodeId, 'lightFalloff', 0)}, i32(floor(${paramSlotExprWired(
          paramLayout,
          nodeId,
          'shadowEnable',
          0,
        )} + 0.5)), ${paramSlotExprWired(paramLayout, nodeId, 'shadowSoftness', 0)}, ${paramSlotExprWired(paramLayout, nodeId, 'shadowSteps', 0)}, i32(floor(${paramSlotExprWired(paramLayout, nodeId, 'specularCookTorrance', 0)} + 0.5)), ${paramSlotExprWired(
          paramLayout,
          nodeId,
          'specularRoughness',
          0,
        )}, ${paramSlotExprWired(paramLayout, nodeId, 'specularF0', 0)})`;
        setNodeOut(nodeId, 'out', { type: 'f32', code: outBt });
        break;
      }
      case 'metaballs': {
        const uv = resolveInputVec2(nodeId, 'in');
        if (!uv) break;

        requireHelper('metaballs-wgsl-core', METABALLS_WGSL_HELPERS);

        const mbCenter = `vec3<f32>(${paramSlotExprWired(paramLayout, nodeId, 'centerX', 0)}, ${paramSlotExprWired(paramLayout, nodeId, 'centerY', 0)}, ${paramSlotExprWired(paramLayout, nodeId, 'centerZ', 0)})`;
        const orbitRadius = paramSlotExprWired(paramLayout, nodeId, 'orbitRadius', 0);
        const blobRadius = paramSlotExprWired(paramLayout, nodeId, 'blobRadius', 0);
        const thresholdMb = paramSlotExprWired(paramLayout, nodeId, 'threshold', 0);
        const tAnim = `(globals.v0.x * ${paramSlotExprWired(paramLayout, nodeId, 'timeSpeed', 0)} + ${paramSlotExprWired(paramLayout, nodeId, 'timeOffset', 0)})`;
        const blobCountSlot = paramSlotExprWired(paramLayout, nodeId, 'blobCount', 0);
        const raymarchStepsMb = paramSlotExprWired(paramLayout, nodeId, 'raymarchSteps', 0);
        const glowIntensityMb = paramSlotExprWired(paramLayout, nodeId, 'glowIntensity', 0);

        const outMb = `metaballsWgsl_standalone_raymarch(${uv.code}, ${mbCenter}, ${orbitRadius}, ${blobRadius}, ${thresholdMb}, ${tAnim}, ${blobCountSlot}, ${raymarchStepsMb}, ${glowIntensityMb})`;
        setNodeOut(nodeId, 'out', { type: 'f32', code: outMb });
        break;
      }
      case 'sphere-raymarch': {
        const uv = resolveInputVec2(nodeId, 'in');
        if (!uv) break;

        const sphereRadius = `max(${paramSlotExprWired(paramLayout, nodeId, 'sphereRadius', 0)}, 0.0001)`;
        const sphereGlowIntensity = paramSlotExprWired(paramLayout, nodeId, 'sphereGlowIntensity', 0);
        const sphereBrightness = paramSlotExprWired(paramLayout, nodeId, 'sphereBrightness', 0);
        const raymarchSteps = paramSlotExprWired(paramLayout, nodeId, 'raymarchSteps', 0);
        const freqX = paramSlotExprWired(paramLayout, nodeId, 'vectorFieldFrequencyX', 0);
        const freqY = paramSlotExprWired(paramLayout, nodeId, 'vectorFieldFrequencyY', 0);
        const freqZ = paramSlotExprWired(paramLayout, nodeId, 'vectorFieldFrequencyZ', 0);
        const amplitude = paramSlotExprWired(paramLayout, nodeId, 'vectorFieldAmplitude', 0);
        const radialStrength = paramSlotExprWired(paramLayout, nodeId, 'vectorFieldRadialStrength', 0);
        const harmonicAmp = paramSlotExprWired(paramLayout, nodeId, 'vectorFieldHarmonicAmplitude', 0);
        const complexity = paramSlotExprWired(paramLayout, nodeId, 'vectorFieldComplexity', 0);
        const distContrib = paramSlotExprWired(paramLayout, nodeId, 'vectorFieldDistanceContribution', 0);
        const vectorFieldSpeed = paramSlotExprWired(paramLayout, nodeId, 'vectorFieldSpeed', 0);
        const animationSpeed = paramSlotExprWired(paramLayout, nodeId, 'animationSpeed', 0);

        requireHelper(
          'sphere-raymarch',
          `
fn sphereRaymarchGlow(
  uv: vec2<f32>,
  time: f32,
  sphereRadius: f32,
  sphereGlowIntensity: f32,
  sphereBrightness: f32,
  raymarchSteps: f32,
  freq: vec3<f32>,
  amplitude: f32,
  radialStrength: f32,
  harmonicAmp: f32,
  complexityIn: f32,
  distContrib: f32,
  vectorFieldSpeed: f32,
  animationSpeed: f32
) -> f32 {
  let ro = vec3<f32>(0.0, 0.0, 3.0);
  let rdRaw = vec3<f32>(uv, -1.0);
  let rd = select(vec3<f32>(0.0, 0.0, -1.0), normalize(rdRaw), length(rdRaw) > 0.001);

  let vectorFieldTime = time * animationSpeed * vectorFieldSpeed;
  let glowMultiplier = sphereGlowIntensity * sphereBrightness;

  var z: f32 = 0.0;
  var d: f32 = 1.0;
  var o: vec4<f32> = vec4<f32>(0.0);

  let complexity = clamp(complexityIn, 1.0, 15.0);
  var maxSteps = clamp(raymarchSteps, 20.0, 200.0);

  for (var ii: i32 = 0; ii < 200; ii = ii + 1) {
    if (f32(ii) >= maxSteps) { break; }

    var pos = ro + z * rd;
    var a = normalize(cos(freq + vectorFieldTime - d * radialStrength));
    pos.z = pos.z + 0.5;
    a = a * dot(a, pos) - cross(a, pos) * amplitude;

    for (var jj: i32 = 1; jj < 15; jj = jj + 1) {
      if (f32(jj) >= complexity) { break; }
      a = a + (sin(a * f32(jj) + vectorFieldTime).yzx / f32(jj)) * harmonicAmp;
    }

    let pLen = length(pos);
    d = 0.05 * abs(pLen - sphereRadius) + distContrib * abs(a.y);

    let cosv = cos(vec4<f32>(d / 0.1) + vec4<f32>(0.0, 2.0, 4.0, 0.0));
    o = o + ((cosv + vec4<f32>(1.0)) / max(d, 1e-6)) * max(z, 0.01) * glowMultiplier;
    z = z + d;
    if (z > 100.0) { break; }
  }

  let accumulatedGlow = length(o.xyz);
  let normalizationDivisor = 200.0 / max(glowMultiplier, 0.1);
  return clamp(accumulatedGlow / normalizationDivisor, 0.0, 1.0);
}
          `
        );

        const out = `sphereRaymarchGlow(${uv.code}, globals.v0.x, ${sphereRadius}, ${sphereGlowIntensity}, ${sphereBrightness}, ${raymarchSteps}, vec3<f32>(${freqX}, ${freqY}, ${freqZ}), ${amplitude}, ${radialStrength}, ${harmonicAmp}, ${complexity}, ${distContrib}, ${vectorFieldSpeed}, ${animationSpeed})`;
        setNodeOut(nodeId, 'out', { type: 'f32', code: out });
        break;
      }
      case 'glass-shell': {
        const uvGs = resolveInputVec2(nodeId, 'in');
        if (!uvGs) break;
        const roGs = resolveInputVec3WithFallback(nodeId, 'ro', ['cameraRoX', 'cameraRoY', 'cameraRoZ']);
        if (!roGs) break;

        const rdLinkGs = lookupInputConnection(graph, nodeId, 'rd');
        let rdGs: Expr;
        if (rdLinkGs) {
          const rdOutGs = resolveNodeOut(rdLinkGs.sourceNodeId, rdLinkGs.sourcePort);
          if (!rdOutGs) break;
          const rdCoercedGs = coerceToType(rdOutGs, 'vec3<f32>');
          if (!rdCoercedGs) break;
          rdGs = rdCoercedGs;
        } else {
          rdGs = { type: 'vec3<f32>', code: `normalize(vec3<f32>(${uvGs.code}, -1.0))` };
        }

        requireHelper('glass-shell', GLASS_SHELL_WGSL);

        const outerShapeI = `i32(floor(${paramSlotExprWired(paramLayout, nodeId, 'outerShape', 0)} + 0.5))`;
        const innerShapeI = `i32(floor(${paramSlotExprWired(paramLayout, nodeId, 'innerShape', 0)} + 0.5))`;
        const iorGs = paramSlotExprWired(paramLayout, nodeId, 'ior', 0);
        const outerSzGs = paramSlotExprWired(paramLayout, nodeId, 'outerSize', 0);
        const ocGs = `vec3<f32>(${paramSlotExprWired(paramLayout, nodeId, 'outerCenterX', 0)}, ${paramSlotExprWired(paramLayout, nodeId, 'outerCenterY', 0)}, ${paramSlotExprWired(paramLayout, nodeId, 'outerCenterZ', 0)})`;
        const innerSzGs = paramSlotExprWired(paramLayout, nodeId, 'innerSize', 0);
        const icGs = `vec3<f32>(${paramSlotExprWired(paramLayout, nodeId, 'innerCenterX', 0)}, ${paramSlotExprWired(paramLayout, nodeId, 'innerCenterY', 0)}, ${paramSlotExprWired(paramLayout, nodeId, 'innerCenterZ', 0)})`;
        const innerBlendGs = paramSlotExprWired(paramLayout, nodeId, 'innerBlendK', 0);
        const outerStepsGs = paramSlotExprWired(paramLayout, nodeId, 'outerSteps', 0);
        const innerStepsGs = paramSlotExprWired(paramLayout, nodeId, 'innerSteps', 0);
        const lightDirGs = `vec3<f32>(${paramSlotExprWired(paramLayout, nodeId, 'lightDirX', 0)}, ${paramSlotExprWired(paramLayout, nodeId, 'lightDirY', 0)}, ${paramSlotExprWired(paramLayout, nodeId, 'lightDirZ', 0)})`;
        const lightIntGs = paramSlotExprWired(paramLayout, nodeId, 'lightIntensity', 0);
        const ambGs = paramSlotExprWired(paramLayout, nodeId, 'ambient', 0);
        const innerAlbGs = `glass_shell_gs_oklch_to_rgb(vec3<f32>(${paramSlotExprWired(paramLayout, nodeId, 'innerL', 0)}, ${paramSlotExprWired(paramLayout, nodeId, 'innerC', 0)}, ${paramSlotExprWired(paramLayout, nodeId, 'innerH', 0)}))`;
        const bgColGs = `glass_shell_gs_oklch_to_rgb(vec3<f32>(${paramSlotExprWired(paramLayout, nodeId, 'bgL', 0)}, ${paramSlotExprWired(paramLayout, nodeId, 'bgC', 0)}, ${paramSlotExprWired(paramLayout, nodeId, 'bgH', 0)}))`;
        const specCtGs = `i32(floor(${paramSlotExprWired(paramLayout, nodeId, 'specularCookTorrance', 0)} + 0.5))`;
        const specRoughGs = paramSlotExprWired(paramLayout, nodeId, 'specularRoughness', 0);
        const specF0Gs = paramSlotExprWired(paramLayout, nodeId, 'specularF0', 0);
        const outerSpecStrGs = paramSlotExprWired(paramLayout, nodeId, 'outerSpecularStr', 0);

        const pxGs = `glass_shell_standalone_pixel(${uvGs.code}, ${roGs.code}, ${rdGs.code}, ${outerShapeI}, ${innerShapeI}, ${iorGs}, ${outerSzGs}, ${ocGs}, ${innerSzGs}, ${icGs}, ${innerBlendGs}, ${outerStepsGs}, ${innerStepsGs}, ${lightDirGs}, ${lightIntGs}, ${ambGs}, ${innerAlbGs}, ${bgColGs}, ${specCtGs}, ${specRoughGs}, ${specF0Gs}, ${outerSpecStrGs})`;
        setNodeOut(nodeId, 'out', { type: 'vec4<f32>', code: pxGs });
        break;
      }
      case 'generic-raymarcher': {
        const uv = resolveInputVec2(nodeId, 'in');
        if (!uv) break;

        const sdfConn = lookupInputConnection(graph, nodeId, 'sdf');
        const sdfNodeInst =
          sdfConn && sdfConn.sourcePort === 'out'
            ? graph.nodes.find((n) => n.id === sdfConn.sourceNodeId)
            : undefined;
        if (
          !sdfConn ||
          sdfConn.sourcePort !== 'out' ||
          !sdfNodeInst ||
          !GENERIC_RAYMARCHER_WEBGPU_MVP_SDF_TYPES.has(sdfNodeInst.type)
        ) {
          setNodeOut(nodeId, 'color', { type: 'vec3<f32>', code: 'vec3<f32>(0.0, 0.0, 0.0)' });
          setNodeOut(nodeId, 'out', { type: 'f32', code: '0.0' });
          break;
        }

        const ro = resolveInputVec3WithFallback(nodeId, 'ro', ['cameraRoX', 'cameraRoY', 'cameraRoZ']);
        if (!ro) break;

        const rdLink = lookupInputConnection(graph, nodeId, 'rd');
        let rd: Expr;
        if (rdLink) {
          const rdOut = resolveNodeOut(rdLink.sourceNodeId, rdLink.sourcePort);
          if (!rdOut) break;
          const rdCoerced = coerceToType(rdOut, 'vec3<f32>');
          if (!rdCoerced) break;
          rd = rdCoerced;
        } else {
          rd = { type: 'vec3<f32>', code: `normalize(vec3<f32>(${uv.code}, -1.0))` };
        }

        const sdfNodeId = sdfConn.sourceNodeId;
        let distanceAtPosWGSL = '';

        if (sdfNodeInst.type === 'mandelbulb-sdf') {
          requireHelper('mandelbulb-sdf-core', MANDELBULB_SDF_DISTANCE_FN);
          const mandelPower = `clamp(f32(${paramSlotExprWired(paramLayout, sdfNodeId, 'power', 0)}), 2.0, 24.0)`;
          const mandelIter = `i32(floor(${paramSlotExprWired(paramLayout, sdfNodeId, 'iterations', 0)} + 0.5))`;
          const bailoutMb = paramSlotExprWired(paramLayout, sdfNodeId, 'bailout', 0);
          const deFudgeMb = paramSlotExprWired(paramLayout, sdfNodeId, 'deFudge', 0);
          const hybridMb = paramSlotExprWired(paramLayout, sdfNodeId, 'hybridMix', 0);
          distanceAtPosWGSL = `mandelbulbSdf_distance(posDisplaced, ${mandelPower}, ${mandelIter}, ${bailoutMb}, ${deFudgeMb}, ${hybridMb})`;
        } else if (sdfNodeInst.type === 'julia-slab-sdf') {
          requireHelper('julia-slab-sdf-wgsl-fn', JULIA_SLAB_SDF_WGSL_FN);
          const juliaReal = paramSlotExprWired(paramLayout, sdfNodeId, 'juliaReal', 0);
          const juliaImag = paramSlotExprWired(paramLayout, sdfNodeId, 'juliaImag', 0);
          const slabHalfThickness = paramSlotExprWired(paramLayout, sdfNodeId, 'slabHalfThickness', 0);
          const xyScaleJl = paramSlotExprWired(paramLayout, sdfNodeId, 'xyScale', 0);
          const escapeRadius = paramSlotExprWired(paramLayout, sdfNodeId, 'escapeRadius', 0);
          const maxIterJl = `i32(floor(${paramSlotExprWired(paramLayout, sdfNodeId, 'maxIter', 0)} + 0.5))`;
          const jlPx = paramSlotExprWired(paramLayout, sdfNodeId, 'positionX', 0);
          const jlPy = paramSlotExprWired(paramLayout, sdfNodeId, 'positionY', 0);
          const jlPz = paramSlotExprWired(paramLayout, sdfNodeId, 'positionZ', 0);
          const pJulia = `(posDisplaced - vec3<f32>(${jlPx}, ${jlPy}, ${jlPz}))`;
          distanceAtPosWGSL = `julia_sl_slab_sdf_dist(${pJulia}, vec2<f32>(${juliaReal}, ${juliaImag}), ${xyScaleJl}, ${escapeRadius}, ${maxIterJl}, ${slabHalfThickness})`;
        } else if (sdfNodeInst.type === 'mandelbox-sdf') {
          requireHelper('sdf-axis-quat-wgsl-shared', SDF_AXIS_QUAT_MAT3_WGSL);
          requireHelper('mandelbox-sdf-eval-wgsl', MANDELBOX_SDF_EVAL_WGSL);

          const scaleMb = paramSlotExprWired(paramLayout, sdfNodeId, 'scale', 0);
          const foldingLimit = paramSlotExprWired(paramLayout, sdfNodeId, 'foldingLimit', 0);
          const minRadius = paramSlotExprWired(paramLayout, sdfNodeId, 'minRadius', 0);
          const iterationsMb = `i32(floor(${paramSlotExprWired(paramLayout, sdfNodeId, 'iterations', 0)} + 0.5))`;
          const offsetMb = `vec3<f32>(${paramSlotExprWired(paramLayout, sdfNodeId, 'offsetX', 0)}, ${paramSlotExprWired(paramLayout, sdfNodeId, 'offsetY', 0)}, ${paramSlotExprWired(paramLayout, sdfNodeId, 'offsetZ', 0)})`;
          const grAx = paramSlotExprWired(paramLayout, sdfNodeId, 'rotationAxisX', 0);
          const grAy = paramSlotExprWired(paramLayout, sdfNodeId, 'rotationAxisY', 0);
          const grAz = paramSlotExprWired(paramLayout, sdfNodeId, 'rotationAxisZ', 0);
          const grAngle = paramSlotExprWired(paramLayout, sdfNodeId, 'rotationAngle', 0);
          const rotMbGr = `sdf_axis_angle_to_mat3(vec3<f32>(${grAx}, ${grAy}, ${grAz}), ${grAngle})`;
          const deFudgeBox = paramSlotExprWired(paramLayout, sdfNodeId, 'deFudge', 0);
          distanceAtPosWGSL = `mandelbox_sdf_distance(posDisplaced, ${scaleMb}, ${foldingLimit}, ${minRadius}, ${iterationsMb}, ${offsetMb}, ${rotMbGr}, ${deFudgeBox})`;
        } else if (sdfNodeInst.type === 'menger-sponge-sdf') {
          requireHelper('sdf-axis-quat-wgsl-shared', SDF_AXIS_QUAT_MAT3_WGSL);
          requireHelper('menger-sponge-sdf-dist-wgsl', MENGER_SPONGE_SDF_WGSL);

          const offMg = `vec3<f32>(${paramSlotExprWired(paramLayout, sdfNodeId, 'offsetX', 0)}, ${paramSlotExprWired(paramLayout, sdfNodeId, 'offsetY', 0)}, ${paramSlotExprWired(paramLayout, sdfNodeId, 'offsetZ', 0)})`;
          const mgAx = paramSlotExprWired(paramLayout, sdfNodeId, 'rotationAxisX', 0);
          const mgAy = paramSlotExprWired(paramLayout, sdfNodeId, 'rotationAxisY', 0);
          const mgAz = paramSlotExprWired(paramLayout, sdfNodeId, 'rotationAxisZ', 0);
          const mgAngle = paramSlotExprWired(paramLayout, sdfNodeId, 'rotationAngle', 0);
          const mRotGr = `sdf_axis_angle_to_mat3(vec3<f32>(${mgAx}, ${mgAy}, ${mgAz}), ${mgAngle})`;
          const domainScaleMg = paramSlotExprWired(paramLayout, sdfNodeId, 'domainScale', 0);
          const innerPm = `(${mRotGr} * (posDisplaced + ${offMg})) * ${domainScaleMg}`;
          const itersMg = `i32(floor(${paramSlotExprWired(paramLayout, sdfNodeId, 'iterations', 0)} + 0.5))`;
          const wallThickness = paramSlotExprWired(paramLayout, sdfNodeId, 'wallThickness', 0);
          const deMulMg = paramSlotExprWired(paramLayout, sdfNodeId, 'deFudge', 0);
          distanceAtPosWGSL = `mer_sponge_distance(${innerPm}, ${itersMg}, ${wallThickness}, ${deMulMg})`;
        } else if (sdfNodeInst.type === 'sierpinski-tetra-sdf') {
          requireHelper('sdf-axis-quat-wgsl-shared', SDF_AXIS_QUAT_MAT3_WGSL);
          requireHelper('sierpinski-tetra-sdf-wgsl', SIERPINSKI_TETRA_SDF_WGSL);

          const offsetStGr = `vec3<f32>(${paramSlotExprWired(paramLayout, sdfNodeId, 'offsetX', 0)}, ${paramSlotExprWired(paramLayout, sdfNodeId, 'offsetY', 0)}, ${paramSlotExprWired(paramLayout, sdfNodeId, 'offsetZ', 0)})`;
          const stGx = paramSlotExprWired(paramLayout, sdfNodeId, 'rotationAxisX', 0);
          const stGy = paramSlotExprWired(paramLayout, sdfNodeId, 'rotationAxisY', 0);
          const stGz = paramSlotExprWired(paramLayout, sdfNodeId, 'rotationAxisZ', 0);
          const stGAngle = paramSlotExprWired(paramLayout, sdfNodeId, 'rotationAngle', 0);
          const stMGr = `sdf_axis_angle_to_mat3(vec3<f32>(${stGx}, ${stGy}, ${stGz}), ${stGAngle})`;
          const scaleStGr = paramSlotExprWired(paramLayout, sdfNodeId, 'scale', 0);
          const itersStGr = `i32(floor(${paramSlotExprWired(paramLayout, sdfNodeId, 'iterations', 0)} + 0.5))`;
          const coreRadius = paramSlotExprWired(paramLayout, sdfNodeId, 'coreRadius', 0);
          const deBiasGr = paramSlotExprWired(paramLayout, sdfNodeId, 'deBias', 0);
          distanceAtPosWGSL = `ster_tetra_distance(posDisplaced, ${stMGr}, ${scaleStGr}, ${offsetStGr}, ${itersStGr}, ${coreRadius}, ${deBiasGr})`;
        } else if (sdfNodeInst.type === 'hex-prism-sdf') {
          const hpR = paramSlotExprWired(paramLayout, sdfNodeId, 'hexRadius', 0);
          const hpH = paramSlotExprWired(paramLayout, sdfNodeId, 'halfHeight', 0);
          const hpOx = paramSlotExprWired(paramLayout, sdfNodeId, 'positionX', 0);
          const hpOy = paramSlotExprWired(paramLayout, sdfNodeId, 'positionY', 0);
          const hpOz = paramSlotExprWired(paramLayout, sdfNodeId, 'positionZ', 0);
          const qh = `abs(posDisplaced - vec3<f32>(${hpOx}, ${hpOy}, ${hpOz}))`;
          const d2h = `max(((${qh}).x * 0.866025 + (${qh}).y * 0.5), (${qh}).y) - (${hpR})`;
          distanceAtPosWGSL = `max(((${qh}).z - (${hpH})), (${d2h}))`;
        } else if (sdfNodeInst.type === 'repeated-hex-prism-sdf') {
          requireHelper('repeated-hex-prism-sdf-wgsl', REPEATED_HEX_PRISM_SDF_WGSL);
          const spX = paramSlotExprWired(paramLayout, sdfNodeId, 'spacingX', 0);
          const spY = paramSlotExprWired(paramLayout, sdfNodeId, 'spacingY', 0);
          const spZ = paramSlotExprWired(paramLayout, sdfNodeId, 'spacingZ', 0);
          const hpR = paramSlotExprWired(paramLayout, sdfNodeId, 'hexRadius', 0);
          const hpH = paramSlotExprWired(paramLayout, sdfNodeId, 'halfHeight', 0);
          distanceAtPosWGSL = `repeatedHexPrismSdf_distance(posDisplaced, vec3<f32>(${spX}, ${spY}, ${spZ}), ${hpR}, ${hpH})`;
        } else if (sdfNodeInst.type === 'radial-repeat-sdf') {
          requireHelper('radial-repeat-sdf-wgsl', RADIAL_REPEAT_SDF_WGSL);
          const shellR = paramSlotExprWired(paramLayout, sdfNodeId, 'shellSpacing', 0);
          const phaseR = paramSlotExprWired(paramLayout, sdfNodeId, 'ringPhase', 0);
          distanceAtPosWGSL = `radialRepeatSdf_distance(posDisplaced, ${shellR}, (${phaseR}) * (${shellR}))`;
        } else if (sdfNodeInst.type === 'ether-sdf') {
          requireHelper(
            'ether-sdf',
            `
fn etherSdfRot2(a: f32) -> mat2x2<f32> {
  let c = cos(a);
  let s = sin(a);
  return mat2x2<f32>(vec2<f32>(c, -s), vec2<f32>(s, c));
}

fn etherSdfMap(pIn: vec3<f32>, t: f32, rotXZ: f32, rotXY: f32, scale: f32, wobble: f32, sineAmp: f32) -> f32 {
  var p = pIn;
  let p_xz = etherSdfRot2(t * rotXZ) * p.xz;
  p = vec3<f32>(p_xz.x, p.y, p_xz.y);
  let p_xy = etherSdfRot2(t * rotXY) * p.xy;
  p = vec3<f32>(p_xy.x, p_xy.y, p.z);
  let q = p * scale + t;
  let radial = length(p + vec3<f32>(sin(t * wobble), 0.0, 0.0)) * log(length(p) + 1.0);
  return radial + sin(q.x + sin(q.z + sin(q.y))) * sineAmp - 1.0;
}
            `
          );
          const rotSpeedXZEther = paramSlotExprWired(paramLayout, sdfNodeId, 'rotSpeedXZ', 0);
          const rotSpeedXYEther = paramSlotExprWired(paramLayout, sdfNodeId, 'rotSpeedXY', 0);
          const scaleEther = paramSlotExprWired(paramLayout, sdfNodeId, 'scale', 0);
          const timeSpeedEther = paramSlotExprWired(paramLayout, sdfNodeId, 'timeSpeed', 0);
          const timeOffsetEther = paramSlotExprWired(paramLayout, sdfNodeId, 'timeOffset', 0);
          const wobbleSpeedEther = paramSlotExprWired(paramLayout, sdfNodeId, 'wobbleSpeed', 0);
          const sineAmpEther = paramSlotExprWired(paramLayout, sdfNodeId, 'sineAmp', 0);
          const breatheAmountEther = paramSlotExprWired(paramLayout, sdfNodeId, 'breatheAmount', 0);
          const breatheSpeedEther = paramSlotExprWired(paramLayout, sdfNodeId, 'breatheSpeed', 0);
          const ce = `vec3<f32>(${paramSlotExprWired(paramLayout, sdfNodeId, 'positionX', 0)}, ${paramSlotExpr(
            paramLayout,
            sdfNodeId,
            'positionY',
            0,
          )}, ${paramSlotExprWired(paramLayout, sdfNodeId, 'positionZ', 0)})`;
          const tEther = `(globals.v0.x * ${timeSpeedEther} + ${timeOffsetEther})`;
          const breatheEther = `(sin(${tEther} * ${breatheSpeedEther}) * ${breatheAmountEther})`;
          const etherPosGr = `(posDisplaced - (${ce} + vec3<f32>(0.0, 0.0, ${breatheEther})))`;
          distanceAtPosWGSL = `etherSdfMap(${etherPosGr}, ${tEther}, ${rotSpeedXZEther}, ${rotSpeedXYEther}, ${scaleEther}, ${wobbleSpeedEther}, ${sineAmpEther})`;
        } else if (sdfNodeInst.type === 'kifs-sdf') {
          requireHelper('sdf-axis-quat-wgsl-shared', SDF_AXIS_QUAT_MAT3_WGSL);
          requireHelper('kifs-sdf-distance-wgsl', KIFS_SDF_DISTANCE_WGSL);
          const kScaleGr = paramSlotExprWired(paramLayout, sdfNodeId, 'scale', 0);
          const kOffGr = `vec3<f32>(${paramSlotExprWired(paramLayout, sdfNodeId, 'offsetX', 0)}, ${paramSlotExpr(
            paramLayout,
            sdfNodeId,
            'offsetY',
            0,
          )}, ${paramSlotExprWired(paramLayout, sdfNodeId, 'offsetZ', 0)})`;
          const kGx = paramSlotExprWired(paramLayout, sdfNodeId, 'rotationAxisX', 0);
          const kGy = paramSlotExprWired(paramLayout, sdfNodeId, 'rotationAxisY', 0);
          const kGz = paramSlotExprWired(paramLayout, sdfNodeId, 'rotationAxisZ', 0);
          const kGAngle = paramSlotExprWired(paramLayout, sdfNodeId, 'rotationAngle', 0);
          const kRotGr = `sdf_axis_angle_to_mat3(vec3<f32>(${kGx}, ${kGy}, ${kGz}), ${kGAngle})`;
          const kIterGr = `i32(floor(${paramSlotExprWired(paramLayout, sdfNodeId, 'iterations', 0)} + 0.5))`;
          const kRadGr = paramSlotExprWired(paramLayout, sdfNodeId, 'sphereRadius', 0);
          distanceAtPosWGSL = `kifs_sdf_distance(posDisplaced, ${kScaleGr}, ${kOffGr}, ${kRotGr}, ${kIterGr}, ${kRadGr})`;
        } else if (sdfNodeInst.type === 'metaballs') {
          requireHelper('metaballs-wgsl-core', METABALLS_WGSL_HELPERS);
          const mbCx = paramSlotExprWired(paramLayout, sdfNodeId, 'centerX', 0);
          const mbCy = paramSlotExprWired(paramLayout, sdfNodeId, 'centerY', 0);
          const mbCz = paramSlotExprWired(paramLayout, sdfNodeId, 'centerZ', 0);
          const mbCenter = `vec3<f32>(${mbCx}, ${mbCy}, ${mbCz})`;
          const mbOrbit = paramSlotExprWired(paramLayout, sdfNodeId, 'orbitRadius', 0);
          const mbBlobR = paramSlotExprWired(paramLayout, sdfNodeId, 'blobRadius', 0);
          const mbThr = paramSlotExprWired(paramLayout, sdfNodeId, 'threshold', 0);
          const mbTanim = `(globals.v0.x * ${paramSlotExprWired(paramLayout, sdfNodeId, 'timeSpeed', 0)} + ${paramSlotExpr(
            paramLayout,
            sdfNodeId,
            'timeOffset',
            0,
          )})`;
          const mbCount = `clamp(i32(floor(${paramSlotExprWired(paramLayout, sdfNodeId, 'blobCount', 0)} + 0.5)), 2, 6)`;
          distanceAtPosWGSL = `metaballsWgsl_implicit_sdf(posDisplaced, ${mbCenter}, ${mbOrbit}, ${mbBlobR}, ${mbThr}, ${mbTanim}, ${mbCount})`;
        } else if (sdfNodeInst.type === 'sphere-raymarch') {
          requireHelper('sphere-raymarch-implicit-dist-grm', SPHERE_RAYMARCH_IMPLICIT_DISTANCE_WGSL);
          const sr = `max(${paramSlotExprWired(paramLayout, sdfNodeId, 'sphereRadius', 0)}, 0.0001)`;
          const freqXsr = paramSlotExprWired(paramLayout, sdfNodeId, 'vectorFieldFrequencyX', 0);
          const freqYsr = paramSlotExprWired(paramLayout, sdfNodeId, 'vectorFieldFrequencyY', 0);
          const freqZsr = paramSlotExprWired(paramLayout, sdfNodeId, 'vectorFieldFrequencyZ', 0);
          const ampsr = paramSlotExprWired(paramLayout, sdfNodeId, 'vectorFieldAmplitude', 0);
          const radialStr = paramSlotExprWired(paramLayout, sdfNodeId, 'vectorFieldRadialStrength', 0);
          const harmonicAmpsr = paramSlotExprWired(paramLayout, sdfNodeId, 'vectorFieldHarmonicAmplitude', 0);
          const complexitysr = paramSlotExprWired(paramLayout, sdfNodeId, 'vectorFieldComplexity', 0);
          const distContribsr = paramSlotExprWired(paramLayout, sdfNodeId, 'vectorFieldDistanceContribution', 0);
          const vfsr = paramSlotExprWired(paramLayout, sdfNodeId, 'vectorFieldSpeed', 0);
          const animSpd = paramSlotExprWired(paramLayout, sdfNodeId, 'animationSpeed', 0);
          distanceAtPosWGSL = `sphereRaymarch_implicit_distance_for_grm(posDisplaced, globals.v0.x, ${sr}, vec3<f32>(${freqXsr}, ${freqYsr}, ${freqZsr}), ${ampsr}, ${radialStr}, ${harmonicAmpsr}, ${complexitysr}, ${distContribsr}, ${vfsr}, ${animSpd})`;
        } else if (sdfNodeInst.type === 'box-torus-sdf') {
          requireHelper('box-torus-sdf-wgsl', BOX_TORUS_SDF_WGSL);
          const btPrim = `clamp(i32(floor(${paramSlotExprWired(paramLayout, sdfNodeId, 'primitiveType', 0)} + 0.5)), i32(0), i32(7))`;
          const btCen = `vec3<f32>(${paramSlotExprWired(paramLayout, sdfNodeId, 'primitiveCenterX', 0)}, ${paramSlotExprWired(
            paramLayout,
            sdfNodeId,
            'primitiveCenterY',
            0,
          )}, ${paramSlotExprWired(paramLayout, sdfNodeId, 'primitiveCenterZ', 0)})`;
          const btRx = paramSlotExprWired(paramLayout, sdfNodeId, 'primitiveRotationX', 0);
          const btRy = paramSlotExprWired(paramLayout, sdfNodeId, 'primitiveRotationY', 0);
          const btRz = paramSlotExprWired(paramLayout, sdfNodeId, 'primitiveRotationZ', 0);
          const btSx = paramSlotExprWired(paramLayout, sdfNodeId, 'primitiveSizeX', 0);
          const btSy = paramSlotExprWired(paramLayout, sdfNodeId, 'primitiveSizeY', 0);
          const btSz = paramSlotExprWired(paramLayout, sdfNodeId, 'primitiveSizeZ', 0);
          const btScene = `BoxTorusSdfSceneParams(${btPrim}, ${btCen}, ${btRx}, ${btRy}, ${btRz}, ${btSx}, ${btSy}, ${btSz})`;
          distanceAtPosWGSL = `boxTorusSceneSdf_distance(posDisplaced, ${btScene})`;
        } else {
          break;
        }

        let displacementAtRayPosWgsl = `vec3<f32>(0.0, 0.0, 0.0)`;
        const dispRayConn = lookupInputConnection(graph, nodeId, 'displacement');
        if (dispRayConn?.sourcePort === 'out') {
          const dnGen = graph.nodes.find((n) => n.id === dispRayConn.sourceNodeId);
          if (!dnGen || dnGen.type !== 'displacement-3d') {
            break;
          }
          requireHelper('displacement-3d', DISPLACEMENT_3D_WGSL_HELPER);
          const dDispId = dnGen.id;
          const scaleDw = paramSlotExprWired(paramLayout, dDispId, 'scale', 0);
          const octDw = paramSlotExprWired(paramLayout, dDispId, 'octaves', 0);
          const lacDw = paramSlotExprWired(paramLayout, dDispId, 'lacunarity', 0);
          const gnDw = paramSlotExprWired(paramLayout, dDispId, 'gain', 0);
          const ampDw = paramSlotExprWired(paramLayout, dDispId, 'amplitude', 0);
          const tsDw = paramSlotExprWired(paramLayout, dDispId, 'timeSpeed', 0);
          const offDw = paramSlotExprWired(paramLayout, dDispId, 'timeOffset', 0);
          const tDw = `((globals.v0.x + ${offDw}) * ${tsDw})`;
          const octaveCountDw = `clamp(i32(floor(${octDw} + 0.5)), 1, 10)`;
          const sampleDw = `(pos * ${scaleDw} + vec3<f32>(0.0, 0.0, ${tDw}))`;
          displacementAtRayPosWgsl = `(${ampDw} * displacementValueFbm3d(${sampleDw}, ${octaveCountDw}, ${lacDw}, ${gnDw}))`;
        }

        const sid = sanitizeWgslIdentifier(nodeId);
        requireHelper(
          `generic-raymarcher-bounded_${sid}`,
          `
struct GenericRayMbOut_${sid} {
  glow : f32,
  color : vec3<f32>,
}

fn genericRaymarchbounded_${sid}(
  ro : vec3<f32>,
  rdIn : vec3<f32>,
  stepsIn : f32,
  glowMultIn : f32,
) -> GenericRayMbOut_${sid} {
  let rdSel = select(vec3<f32>(0.0, 0.0, -1.0), normalize(rdIn), length(rdIn) > 0.001);
  let steps = clamp(stepsIn, 16.0, 200.0);
  let glowMult = glowMultIn;

  var t : f32 = 0.0;
  var acc : vec4<f32> = vec4<f32>(0.0);
  var hitRgb : vec3<f32> = vec3<f32>(0.0);

  for (var ii : i32 = 0; ii < 200; ii = ii + 1) {
    if (f32(ii) >= steps) { break; }
    let pos = ro + rdSel * t;
    let posDisplaced = pos + (${displacementAtRayPosWgsl});
    let d = ${distanceAtPosWGSL};
    if (d < 0.001) {
      let ip = ro + rdSel * t;
      let hitColor = vec3<f32>(
        0.7 + 0.3 * sin(ip.z / 8.0 + ip.x / 2.0),
        0.6 + 0.3 * cos(ip.z / 8.0 + ip.y / 2.0),
        0.5 + 0.4 * sin(ip.z / 8.0 + ip.x),
      );
      let fog = f32(ii) / steps;
      hitRgb = hitColor - vec3<f32>(fog, fog, fog);
      let cosHit = cos(vec4<f32>(d / 0.1) + vec4<f32>(0.0, 2.0, 4.0, 0.0));
      acc = acc + ((cosHit + vec4<f32>(1.0)) / 0.001) * max(t, 0.01) * glowMult;
      t = t + 0.001;
      break;
    }
    let cosm = cos(vec4<f32>(d / 0.1) + vec4<f32>(0.0, 2.0, 4.0, 0.0));
    acc = acc + ((cosm + vec4<f32>(1.0)) / max(d, 1e-6)) * max(t, 0.01) * glowMult;
    t = t + d;
    if (t > 100.0) { break; }
  }

  let glowNorm = length(acc.xyz);
  let div = 200.0 / max(glowMult, 0.1);
  let glowVal = clamp(glowNorm / div, 0.0, 1.0);
  return GenericRayMbOut_${sid}(glowVal, hitRgb);
}
          `
        );

        const stepsPb = paramSlotExprWired(paramLayout, nodeId, 'raymarchSteps', 0);
        const glowMultRay = `((${paramSlotExprWired(paramLayout, nodeId, 'glowIntensity', 0)}) * (${paramSlotExprWired(paramLayout, nodeId, 'brightness', 0)}))`;

        const march = `genericRaymarchbounded_${sid}(${ro.code}, ${rd.code}, ${stepsPb}, ${glowMultRay})`;

        setNodeOut(nodeId, 'color', { type: 'vec3<f32>', code: `${march}.color` });
        setNodeOut(nodeId, 'out', { type: 'f32', code: `${march}.glow` });
        break;
      }
      case 'plane-grid': {
        const pIn = resolveInputVec2(nodeId, 'in');
        if (!pIn) break;

        const planeType = paramSlotExprWired(paramLayout, nodeId, 'planeType', 0);
        const planeScale = paramSlotExprWired(paramLayout, nodeId, 'planeScale', 0);
        const planeSpacing = `max(${paramSlotExprWired(paramLayout, nodeId, 'planeSpacing', 0)}, 0.0001)`;
        const planeLineWidth = paramSlotExprWired(paramLayout, nodeId, 'planeLineWidth', 0);
        const planeIntensity = paramSlotExprWired(paramLayout, nodeId, 'planeIntensity', 0);
        const planeRotationDeg = paramSlotExprWired(paramLayout, nodeId, 'planeRotation', 0);
        const planeNormalX = paramSlotExprWired(paramLayout, nodeId, 'planeNormalX', 0);
        const planeNormalY = paramSlotExprWired(paramLayout, nodeId, 'planeNormalY', 0);
        const planeNormalZ = paramSlotExprWired(paramLayout, nodeId, 'planeNormalZ', 0);
        const planeHeight = paramSlotExprWired(paramLayout, nodeId, 'planeHeight', 0);

        requireHelper(
          'plane-grid',
          `
fn pgRotate(p: vec2<f32>, angle: f32) -> vec2<f32> {
  let c = cos(angle);
  let s = sin(angle);
  return vec2<f32>(p.x * c - p.y * s, p.x * s + p.y * c);
}

fn pgGridPattern(p: vec2<f32>, spacing: f32, line_width: f32) -> f32 {
  let s = max(spacing, 0.0001);
  let hw = min(max(0.5 * max(line_width, 1e-6), 1e-6), s * 0.495);
  let qx = p.x - floor(p.x / s) * s;
  let qy = p.y - floor(p.y / s) * s;
  let dx = min(qx, s - qx);
  let dy = min(qy, s - qy);
  let vx = 1.0 - step(hw, dx);
  let vy = 1.0 - step(hw, dy);
  return max(vx, vy);
}

fn pgCheckerboard(p: vec2<f32>, size: f32) -> f32 {
  let c = floor(p / size);
  let s = c.x + c.y;
  return s - 2.0 * floor(s / 2.0);
}

fn pgSdPlane(p: vec3<f32>, n: vec3<f32>, h: f32) -> f32 {
  let nLen = length(n);
  let nNorm = select(vec3<f32>(0.0, 1.0, 0.0), normalize(n), nLen > 0.001);
  return dot(p, nNorm) + h;
}

fn pgPlaneUvPg(hit: vec3<f32>, n: vec3<f32>) -> vec2<f32> {
  let helper = select(vec3<f32>(0.0, 1.0, 0.0), vec3<f32>(1.0, 0.0, 0.0), abs(n.y) >= 0.999);
  let tangent_u = normalize(cross(helper, n));
  let tangent_v = cross(n, tangent_u);
  return vec2<f32>(dot(hit, tangent_u), dot(hit, tangent_v));
}
          `
        );

        const angleRad = `(${planeRotationDeg} * 3.14159 / 180.0)`;
        const rotatedP = `pgRotate(${pIn.code}, ${angleRad})`;

        const grid2d = `pgGridPattern(${rotatedP} * ${planeScale}, ${planeSpacing}, ${planeLineWidth}) * ${planeIntensity}`;
        const checker = `pgCheckerboard(${rotatedP} * ${planeScale}, ${planeSpacing}) * ${planeIntensity}`;

        const ro = `vec3<f32>(0.0, 0.0, 3.0)`;
        const rd = `normalize(vec3<f32>(${pIn.code}, -1.0))`;
        const n = `normalize(vec3<f32>(${planeNormalX}, ${planeNormalY}, ${planeNormalZ}))`;
        const denom = `dot(${rd}, ${n})`;
        const sdRo = `pgSdPlane(${ro}, ${n}, ${planeHeight})`;
        const t = `(-(${sdRo}) / ${denom})`;
        const hit = `(${ro} + ${rd} * ${t})`;
        const rayRotatedP = `pgRotate(pgPlaneUvPg(${hit}, ${n}) * ${planeScale}, ${angleRad})`;
        const rayHitValid = `(abs(${denom}) > 0.0001 && ${t} > 0.0)`;
        const rayPattern = `pgGridPattern(${rayRotatedP}, ${planeSpacing}, ${planeLineWidth}) * ${planeIntensity}`;
        const rayGrid = `select(0.0, ${rayPattern}, ${rayHitValid})`;

        // planeType: 0=ray, 1=grid, 2=checker — matches GLSL if/else branches.
        // WGSL select(a, b, c) returns b when c is true, else a.
        const isRay = `(${planeType} < 0.5)`;
        const isChecker = `(${planeType} >= 1.5)`;
        const nonRay = `select(${grid2d}, ${checker}, ${isChecker})`;
        const outVal = `select(${nonRay}, ${rayGrid}, ${isRay})`;
        setNodeOut(nodeId, 'out', { type: 'f32', code: outVal });
        break;
      }
      case 'particle-system': {
        const uvIn = resolveInputVec2(nodeId, 'in');
        if (!uvIn) break;

        const particleCellSize = paramSlotExprWired(paramLayout, nodeId, 'particleCellSize', 0);
        const particleCountF = paramSlotExprWired(paramLayout, nodeId, 'particleCount', 0);
        const particleSize = paramSlotExprWired(paramLayout, nodeId, 'particleSize', 0);
        const particleIntensity = paramSlotExprWired(paramLayout, nodeId, 'particleIntensity', 0);
        const particleFalloff = paramSlotExprWired(paramLayout, nodeId, 'particleFalloff', 0);
        const particleTimeSpeed = paramSlotExprWired(paramLayout, nodeId, 'particleTimeSpeed', 0);
        const particleTimeOffset = paramSlotExprWired(paramLayout, nodeId, 'particleTimeOffset', 0);

        requireHelper(
          'particleSystem',
          `
fn ps_hash_ps(n: f32) -> f32 {
  return fract(sin(n) * 43758.5453);
}

fn ps_hash2_ps(n: f32) -> vec2<f32> {
  return fract(sin(vec2<f32>(n, n + 1.0)) * vec2<f32>(43758.5453, 22578.1459));
}

fn ps_particle_cell_ps(p: vec2<f32>, cellSize: f32) -> vec2<f32> {
  return floor(p / cellSize);
}

fn ps_speckle_spot_uv_ps(cell: vec2<f32>, tAnim: f32, particleId: f32) -> vec2<f32> {
  let seed = dot(cell, vec2<f32>(12.9898, 78.233)) + particleId * 9.17;
  let base = ps_hash2_ps(seed);
  let sx = ps_hash_ps(seed + 11.1);
  let sy = ps_hash_ps(seed + 22.2);
  let tau = 6.28318530718;
  let wobble = vec2<f32>(sin(tAnim + sx * tau), cos(tAnim * 1.07 + sy * tau));
  return fract(base + 0.2 * wobble);
}

fn ps_particle_influence_ps(pp: vec2<f32>, pPos: vec2<f32>, size: f32, intensity: f32, falloff: f32) -> f32 {
  let f = max(falloff, 0.01);
  let dist = length(pp - pPos);
  return exp(-dist * dist * f / (2.0 * size * size)) * intensity;
}

fn ps_particle_system_ps(p: vec2<f32>, tAnim: f32, cellSize: f32, particlesPerCell: i32, pSize: f32, pIntensity: f32, pFalloff: f32) -> f32 {
  let cell = ps_particle_cell_ps(p, cellSize);
  var value: f32 = 0.0;
  for (var xx: i32 = -1; xx <= 1; xx = xx + 1) {
    for (var yy: i32 = -1; yy <= 1; yy = yy + 1) {
      let neighborCell = cell + vec2<f32>(f32(xx), f32(yy));
      for (var i: i32 = 0; i < 4; i = i + 1) {
        if (i >= particlesPerCell) { break; }
        let particleId = f32(i) + dot(neighborCell, vec2<f32>(12.9898, 78.233));
        let particleLocalPos = ps_speckle_spot_uv_ps(neighborCell, tAnim, particleId);
        let worldPos = neighborCell * cellSize + particleLocalPos * cellSize;
        value = value + ps_particle_influence_ps(p, worldPos, pSize, pIntensity, pFalloff);
      }
    }
  }
  return min(value, 1.0);
}
          `
        );

        const countI = `clamp(i32(round(${particleCountF})), 1, 4)`;
        const tAnim = `(globals.v0.x + ${particleTimeOffset}) * ${particleTimeSpeed}`;
        const particles = `(ps_particle_system_ps(${uvIn.code}, ${tAnim}, ${particleCellSize}, ${countI}, ${particleSize}, ${particleIntensity}, ${particleFalloff}))`;

        setNodeOut(nodeId, 'out', { type: 'f32', code: particles });
        break;
      }
      case 'rings': {
        const pIn = resolveInputVec2(nodeId, 'in');
        if (!pIn) break;

        const cx = paramSlotExprWired(paramLayout, nodeId, 'ringCenterX', 0);
        const cy = paramSlotExprWired(paramLayout, nodeId, 'ringCenterY', 0);
        const distScale = paramSlotExprWired(paramLayout, nodeId, 'ringDistanceScale', 0);
        const spacing = paramSlotExprWired(paramLayout, nodeId, 'ringSpacing', 0);
        const lineMode = paramSlotExprWired(paramLayout, nodeId, 'ringLineMode', 0);
        const width = paramSlotExprWired(paramLayout, nodeId, 'ringWidth', 0);
        const feather = paramSlotExprWired(paramLayout, nodeId, 'ringFeather', 0);
        const invert = paramSlotExprWired(paramLayout, nodeId, 'ringInvert', 0);
        const falloff = paramSlotExprWired(paramLayout, nodeId, 'ringFalloff', 0);
        const level = paramSlotExprWired(paramLayout, nodeId, 'ringLevel', 0);
        const timeOffset = paramSlotExprWired(paramLayout, nodeId, 'ringTimeOffset', 0);
        const speed = paramSlotExprWired(paramLayout, nodeId, 'ringSpeed', 0);

        requireHelper(
          'rings',
          `
fn rings(
  p: vec2<f32>,
  center: vec2<f32>,
  distScale: f32,
  spacing: f32,
  lineMode: f32,
  width: f32,
  feather: f32,
  invert: f32,
  falloff: f32,
  phase: f32
) -> f32 {
  let distRaw = length(p - center);
  let dist = distRaw * max(distScale, 0.0);
  let distEnv = max(distRaw, 0.0);
  let envelope = exp(-distEnv * falloff);
  let spacingClamped = max(0.0001, spacing);
  let radialPhase = 6.28318530718 * dist / spacingClamped - phase;
  let base = sin(radialPhase) * 0.5 + 0.5;

  if (lineMode < 0.5) {
    let v = select(base, 1.0 - base, invert > 0.5);
    return v * envelope;
  }

  let flow = dist / spacingClamped - phase / 6.28318530718;
  let u = fract(flow);
  let dR = min(u, 1.0 - u) * spacingClamped;
  let maxHalfVal = max(0.0002, 0.5 * spacingClamped - 0.0001);
  let halfW = clamp(width * 0.25, 0.00015, maxHalfVal);
  let featMax = max(0.0, maxHalfVal - halfW);
  let feat = clamp(feather * featMax * 0.96, 0.0, featMax);
  let t = clamp((dR - halfW) / max(feat, 1e-6), 0.0, 1.0);
  let line = 1.0 - pow(t, 0.55);
  let v = select(line, 1.0 - line, invert > 0.5);
  return v * envelope;
}
          `
        );

        const center = `vec2<f32>(${cx}, ${cy})`;
        const phase = `((globals.v0.x * ${speed}) + ${timeOffset})`;
        const r = `rings(${pIn.code}, ${center}, ${distScale}, ${spacing}, ${lineMode}, ${width}, ${feather}, ${invert}, ${falloff}, ${phase})`;
        setNodeOut(nodeId, 'out', { type: 'f32', code: `(${r} * ${level})` });
        break;
      }
      case 'radial-pulse': {
        const pIn = resolveInputVec2(nodeId, 'in');
        if (!pIn) break;

        const cx = paramSlotExprWired(paramLayout, nodeId, 'pulseCenterX', 0);
        const cy = paramSlotExprWired(paramLayout, nodeId, 'pulseCenterY', 0);
        const distScale = paramSlotExprWired(paramLayout, nodeId, 'pulseDistanceScale', 0);
        const falloff = paramSlotExprWired(paramLayout, nodeId, 'pulseFalloff', 0);
        const thickness = paramSlotExprWired(paramLayout, nodeId, 'pulseThickness', 0);
        const feather = paramSlotExprWired(paramLayout, nodeId, 'pulseFeather', 0);
        const speed = paramSlotExprWired(paramLayout, nodeId, 'pulseSpeed', 0);
        const level = paramSlotExprWired(paramLayout, nodeId, 'pulseLevel', 0);

        requireHelper(
          'radialPulseWaveRp',
          `
fn radialPulseWaveRp(
  p: vec2<f32>,
  center: vec2<f32>,
  distScale: f32,
  falloff: f32,
  thickness: f32,
  feather: f32,
  speed: f32,
  spawnTimeline: f32,
  time: f32
) -> f32 {
  if (spawnTimeline < -9e9) {
    return 0.0;
  }
  let distRaw = length(p - center);
  let distScaled = distRaw * max(distScale, 0.0);
  let envInput = max(distRaw, 0.0);
  let envelope = exp(-envInput * max(falloff, 0.0));
  let tRel = max(0.0, time - spawnTimeline);
  let waveR = max(0.0, speed) * tRel;
  let dBand = abs(distScaled - waveR);
  let halfW = max(0.00025, thickness);
  let featMax = max(1e-4, halfW * 0.995);
  let feat = clamp(feather * halfW * 1.35, 0.0, featMax);
  let edgeT = clamp((dBand - halfW) / max(feat, 1e-6), 0.0, 1.0);
  let line = 1.0 - pow(edgeT, 0.55);
  return clamp(line * envelope, 0.0, 1.0);
}
          `
        );

        const center = `vec2<f32>(${cx}, ${cy})`;
        const time = `globals.v0.x`;
        const waveSlots: string[] = [];
        for (let slot = 0; slot < RADIAL_PULSE_SPAWN_SLOT_COUNT; slot++) {
          const spawnKey = radialPulseSpawnTimelineParam(slot);
          const spawnTl = paramSlotExprWired(paramLayout, nodeId, spawnKey, 0);
          waveSlots.push(
            `radialPulseWaveRp(${pIn.code}, ${center}, ${distScale}, ${falloff}, ${thickness}, ${feather}, ${speed}, ${spawnTl}, ${time})`
          );
        }
        const r = waveSlots.join(' + ');
        setNodeOut(nodeId, 'out', { type: 'f32', code: `(${r} * ${level})` });
        break;
      }
      case 'triangle-grid': {
        const pIn = resolveInputVec2(nodeId, 'in');
        if (!pIn) break;

        const triProjection = paramSlotExprWired(paramLayout, nodeId, 'triProjection', 0);
        const spacing = `max(0.001, ${paramSlotExprWired(paramLayout, nodeId, 'triScale', 0)})`;
        const lineWidth = `max(0.0001, ${paramSlotExprWired(paramLayout, nodeId, 'triLineWidth', 0)})`;
        const rotationDeg = paramSlotExprWired(paramLayout, nodeId, 'triRotation', 0);
        const intensity = paramSlotExprWired(paramLayout, nodeId, 'triIntensity', 0);
        const fill = paramSlotExprWired(paramLayout, nodeId, 'triFill', 0);
        const triPlaneScale = paramSlotExprWired(paramLayout, nodeId, 'triPlaneScale', 0);
        const triPlaneNormalX = paramSlotExprWired(paramLayout, nodeId, 'triPlaneNormalX', 0);
        const triPlaneNormalY = paramSlotExprWired(paramLayout, nodeId, 'triPlaneNormalY', 0);
        const triPlaneNormalZ = paramSlotExprWired(paramLayout, nodeId, 'triPlaneNormalZ', 0);
        const triPlaneHeight = paramSlotExprWired(paramLayout, nodeId, 'triPlaneHeight', 0);

        requireHelper('rotate2', WGSL_HELPER_ROTATE2);
        requireHelper(
          'triangle-grid',
          `
fn tgPgSdPlane(p: vec3<f32>, n: vec3<f32>, h: f32) -> f32 {
  let nLen = length(n);
  let nNorm = select(vec3<f32>(0.0, 1.0, 0.0), normalize(n), nLen > 0.001);
  return dot(p, nNorm) + h;
}

fn tgPlaneUv(hit: vec3<f32>, n: vec3<f32>) -> vec2<f32> {
  let helper = select(vec3<f32>(0.0, 1.0, 0.0), vec3<f32>(1.0, 0.0, 0.0), abs(n.y) >= 0.999);
  let tangent_u = normalize(cross(helper, n));
  let tangent_v = cross(n, tangent_u);
  return vec2<f32>(dot(hit, tangent_u), dot(hit, tangent_v));
}

fn triangleGrid(p: vec2<f32>, spacing: f32) -> vec2<f32> {
  let sqrt3 = 1.7320508;
  let s = max(0.001, spacing);

  let u0 = p.x / s;
  let u1 = (p.x * 0.5 + p.y * (sqrt3 * 0.5)) / s;
  let u2 = (-p.x * 0.5 + p.y * (sqrt3 * 0.5)) / s;

  let d0 = abs(fract(u0 + 0.5) - 0.5) * s;
  let d1 = abs(fract(u1 + 0.5) - 0.5) * s;
  let d2 = abs(fract(u2 + 0.5) - 0.5) * s;

  let distToEdge = min(min(d0, d1), d2);

  let fl = vec3<f32>(floor(u0 + 0.5), floor(u1 + 0.5), floor(u2 + 0.5));
  let cellId = (fl.x + fl.y + fl.z) - 2.0 * floor((fl.x + fl.y + fl.z) / 2.0);
  return vec2<f32>(distToEdge, cellId);
}
          `
        );

        const angleRad = `(${rotationDeg} * 3.14159 / 180.0)`;
        const rotated2d = `rotate2(${pIn.code}, ${angleRad})`;
        const dAndId2d = `triangleGrid(${rotated2d}, ${spacing})`;
        const dist2d = `${dAndId2d}.x`;
        const cell2d = `${dAndId2d}.y`;
        const edge2d = `(1.0 - smoothstep(0.0, ${lineWidth}, ${dist2d}))`;
        const out2d = `(mix(${edge2d}, ${cell2d}, ${fill}) * ${intensity})`;

        const ro = `vec3<f32>(0.0, 0.0, 3.0)`;
        const rd = `normalize(vec3<f32>(${pIn.code}, -1.0))`;
        const n = `normalize(vec3<f32>(${triPlaneNormalX}, ${triPlaneNormalY}, ${triPlaneNormalZ}))`;
        const denom = `dot(${rd}, ${n})`;
        const sdRo = `tgPgSdPlane(${ro}, ${n}, ${triPlaneHeight})`;
        const t = `(-(${sdRo}) / ${denom})`;
        const hit = `(${ro} + ${rd} * ${t})`;
        const rotatedRay = `rotate2(tgPlaneUv(${hit}, ${n}) * ${triPlaneScale}, ${angleRad})`;
        const dAndIdRay = `triangleGrid(${rotatedRay}, ${spacing})`;
        const distRay = `${dAndIdRay}.x`;
        const cellRay = `${dAndIdRay}.y`;
        const edgeRay = `(1.0 - smoothstep(0.0, ${lineWidth}, ${distRay}))`;
        const rayHitValid = `(abs(${denom}) > 0.0001 && ${t} > 0.0)`;
        const patternRay = `(mix(${edgeRay}, ${cellRay}, ${fill}) * ${intensity})`;
        const outRay = `select(0.0, ${patternRay}, ${rayHitValid})`;

        const isUv = `(${triProjection} > 0.5)`;
        const outVal = `select(${outRay}, ${out2d}, ${isUv})`;
        setNodeOut(nodeId, 'out', { type: 'f32', code: outVal });
        break;
      }
      case 'disco-pattern': {
        const uvIn = resolveInputVec2(nodeId, 'in');
        if (!uvIn) break;

        // Reuse existing WGSL hash32(vec2)->vec3 helper for the disco cell hash.
        requireHelper(
          'hash32',
          `
fn hash32(p: vec2<f32>) -> vec3<f32> {
  var p3 = fract(vec3<f32>(p.x, p.y, p.x) * vec3<f32>(0.1031, 0.1030, 0.0973));
  p3 = p3 + vec3<f32>(dot(p3, p3.yxz + vec3<f32>(19.19)));
  return fract((p3.xxy + p3.yzz) * p3.zyx);
}
          `
        );

        const scale = paramSlotExprWired(paramLayout, nodeId, 'discoScale', 0);
        const offX = paramSlotExprWired(paramLayout, nodeId, 'phaseOffsetX', 0);
        const offY = paramSlotExprWired(paramLayout, nodeId, 'phaseOffsetY', 0);

        const uv = `(${uvIn.code} * ${scale} + vec2<f32>(${offX}, ${offY}))`;
        const cell = `vec2<f32>(floor((${uv}).x - (${uv}).y), floor((${uv}).x + (${uv}).y))`;
        const rgb = `hash32(${cell})`;
        const v = `(abs(cos((${uv}).x * 6.283185) + cos((${uv}).y * 6.283185)) * 0.5)`;
        setNodeOut(nodeId, 'out', { type: 'vec4<f32>', code: `vec4<f32>(${rgb}, ${v})` });
        break;
      }
      case 'hexagonal-grid': {
        const uvIn = resolveInputVec2(nodeId, 'in');
        if (!uvIn) break;

        const hexSize = paramSlotExprWired(paramLayout, nodeId, 'hexSize', 0);
        const hexGap = paramSlotExprWired(paramLayout, nodeId, 'hexGap', 0);
        const hexCellRotationDeg = paramSlotExprWired(paramLayout, nodeId, 'hexCellRotation', 0);
        const hexSizeVariation = paramSlotExprWired(paramLayout, nodeId, 'hexSizeVariation', 0);
        const hexSizeVariationStepsF = paramSlotExprWired(paramLayout, nodeId, 'hexSizeVariationSteps', 0);
        const hexVariationAnimationSpeed = paramSlotExprWired(paramLayout, nodeId, 'hexVariationAnimationSpeed', 0);
        const hexRotationDeg = paramSlotExprWired(paramLayout, nodeId, 'hexRotation', 0);
        const hexIntensity = paramSlotExprWired(paramLayout, nodeId, 'hexIntensity', 0);
        const hexIntensityVariation = paramSlotExprWired(paramLayout, nodeId, 'hexIntensityVariation', 0);
        const hexSoftness = paramSlotExprWired(paramLayout, nodeId, 'hexSoftness', 0);
        const hexEdgeThickness = paramSlotExprWired(paramLayout, nodeId, 'hexEdgeThickness', 0);
        const hexEdgeIntensity = paramSlotExprWired(paramLayout, nodeId, 'hexEdgeIntensity', 0);
        const hexRimWidth = paramSlotExprWired(paramLayout, nodeId, 'hexRimWidth', 0);
        const hexRimIntensity = paramSlotExprWired(paramLayout, nodeId, 'hexRimIntensity', 0);
        const hexSeedF = paramSlotExprWired(paramLayout, nodeId, 'hexSeed', 0);
        const hexPulseSpeed = paramSlotExprWired(paramLayout, nodeId, 'hexPulseSpeed', 0);
        const hexPulseDepth = paramSlotExprWired(paramLayout, nodeId, 'hexPulseDepth', 0);
        const hexPulseVariationImpact = paramSlotExprWired(paramLayout, nodeId, 'hexPulseVariationImpact', 0);
        const hexWaveDirectionDeg = paramSlotExprWired(paramLayout, nodeId, 'hexWaveDirection', 0);
        const hexWaveFrequency = paramSlotExprWired(paramLayout, nodeId, 'hexWaveFrequency', 0);
        const hexWaveSpeed = paramSlotExprWired(paramLayout, nodeId, 'hexWaveSpeed', 0);
        const hexWaveDepth = paramSlotExprWired(paramLayout, nodeId, 'hexWaveDepth', 0);
        const hexWaveVariationImpact = paramSlotExprWired(paramLayout, nodeId, 'hexWaveVariationImpact', 0);

        requireHelper('wgslMod', WGSL_HELPER_WGSL_MOD);
        requireHelper('rotate2', WGSL_HELPER_ROTATE2);
        requireHelper(
          'hexagonal-grid',
          `
fn hexAxialRounded(p: vec2<f32>, size: f32) -> vec2<f32> {
  let sqrt3 = 1.7320508;
  let h = vec2<f32>(
    (sqrt3 / 3.0 * p.x - 1.0 / 3.0 * p.y) / size,
    (2.0 / 3.0 * p.y) / size
  );

  let x = h.x;
  let z = h.y;
  let y = -x - z;

  var rx = round(x);
  var ry = round(y);
  var rz = round(z);

  let dx = abs(rx - x);
  let dy = abs(ry - y);
  let dz = abs(rz - z);

  if (dx > dy && dx > dz) { rx = -ry - rz; }
  else if (dy > dz) { ry = -rx - rz; }
  else { rz = -rx - ry; }

  return vec2<f32>(rx, rz);
}

fn hexCenterFromAxial(axial: vec2<f32>, size: f32) -> vec2<f32> {
  let sqrt3 = 1.7320508;
  let rx = axial.x;
  let rz = axial.y;
  return vec2<f32>(
    size * sqrt3 * (rx + rz * 0.5),
    size * 1.5 * rz
  );
}

fn hash12(p: vec2<f32>) -> f32 {
  return fract(sin(dot(p, vec2<f32>(127.1, 311.7))) * 43758.5453123);
}

fn hexSDF(pIn: vec2<f32>, r: f32) -> f32 {
  let k = vec3<f32>(-0.866025404, 0.5, 0.577350269);
  var p = abs(pIn);
  p = p - 2.0 * min(dot(k.xy, p), 0.0) * k.xy;
  p = p - vec2<f32>(clamp(p.x, -k.z * r, k.z * r), r);
  return length(p) * sign(p.y);
}
          `
        );

        const rot = `(${hexRotationDeg} * 3.14159 / 180.0)`;
        const p = `rotate2(${uvIn.code}, ${rot})`;
        const size = `(${hexSize} * 0.25)`;
        const cell = `hexAxialRounded(${p}, ${size})`;
        const center = `hexCenterFromAxial(${cell}, ${size})`;
        const local = `(${p} - ${center})`;

        const inradius = `(${size} * 1.7320508 * 0.5)`;
        const gap = `clamp(${hexGap}, 0.0, 2.0)`;

        // int params are stored in float param buffer; treat as rounded ints where needed.
        const seed = `floor(${hexSeedF} + 0.5)`;

        const phase = `(hash12(${cell} + vec2<f32>(${seed} + 91.7, ${seed} + 91.7)) * 6.2831853)`;
        const pulse = `max(1.0 + ${hexPulseDepth} * sin(globals.v0.x * ${hexPulseSpeed} + ${phase}), 0.0)`;

        const waveEnabled = `(${hexWaveDepth} > 0.0 && (${hexWaveFrequency} > 0.0 || ${hexWaveSpeed} > 0.0))`;
        const th = `(${hexWaveDirectionDeg} * 3.14159 / 180.0)`;
        const wdir = `vec2<f32>(cos(${th}), sin(${th}))`;
        const wave = `sin(dot(${center}, ${wdir}) * ${hexWaveFrequency} + globals.v0.x * ${hexWaveSpeed})`;
        const waveMul = `select(1.0, max(1.0 + ${wave} * ${hexWaveDepth}, 0.0), ${waveEnabled})`;

        const variationMod = `(mix(1.0, ${pulse}, ${hexPulseVariationImpact}) * mix(1.0, ${waveMul}, ${hexWaveVariationImpact}))`;
        const varTime = `floor(globals.v0.x * max(${hexVariationAnimationSpeed}, 0.0))`;

        const sizeRnd = `hash12(${cell} + vec2<f32>(${seed} + ${varTime}, ${seed} + ${varTime}))`;
        const stepsI = `i32(floor(${hexSizeVariationStepsF} + 0.5))`;
        const stepsF = `f32(${stepsI})`;
        const sizeRndQ = `select(${sizeRnd}, floor(${sizeRnd} * ${stepsF}) / max(1.0, ${stepsF} - 1.0), ${stepsI} > 1)`;

        const sizeVarAmt = `(${hexSizeVariation} * ${variationMod})`;
        const sizeMul = `max(1.0 + ((${sizeRndQ} * 2.0 - 1.0) * ${sizeVarAmt}), 0.0)`;
        const patternInradius = `max(${inradius} * (1.0 - ${gap}) * ${sizeMul}, 0.0)`;

        const cellAngleRad = `(${hexCellRotationDeg} * 3.14159 / 180.0)`;
        const lp = `rotate2(${local}, (0.5235988 + ${cellAngleRad}))`;
        const d = `hexSDF(${lp}, ${patternInradius})`;

        const aa = `max(${hexSoftness}, 1e-5)`;
        const fill = `(1.0 - smoothstep(-${aa}, ${aa}, ${d}))`;

        const edgeW = `(${patternInradius} * clamp(${hexEdgeThickness}, 0.0, 1.0))`;
        const edge = `(1.0 - smoothstep(${edgeW}, ${edgeW} + ${aa}, abs(${d})))`;

        const rimW = `(${patternInradius} * clamp(${hexRimWidth}, 0.0, 1.0))`;
        const rim = `select(0.0, clamp(smoothstep(-${rimW} - ${aa}, -${rimW} + ${aa}, ${d}) - smoothstep(-${aa}, ${aa}, ${d}), 0.0, 1.0), ${rimW} > 0.0)`;

        const intRnd = `hash12(${cell} + vec2<f32>(${seed} + 17.23 + ${varTime}, ${seed} + 17.23 + ${varTime}))`;
        const intVarAmt = `(${hexIntensityVariation} * ${variationMod})`;
        const intMul = `max(1.0 + ((${intRnd} * 2.0 - 1.0) * ${intVarAmt}), 0.0)`;

        const value = `(${fill} * ${hexIntensity} * ${intMul} * ${pulse} * ${waveMul})`;
        const edgeValue = `(${edge} * ${hexEdgeIntensity})`;
        const rimValue = `(${rim} * ${hexRimIntensity})`;

        setNodeOut(nodeId, 'out', { type: 'f32', code: `(${value} + ${edgeValue} + ${rimValue})` });
        break;
      }
      case 'flow-field-pattern': {
        const uvIn = resolveInputVec2(nodeId, 'in');
        if (!uvIn) break;

        const flowScale = paramSlotExprWired(paramLayout, nodeId, 'flowScale', 0);
        const flowCurlScale = paramSlotExprWired(paramLayout, nodeId, 'flowCurlScale', 0);
        const flowTimeSpeed = paramSlotExprWired(paramLayout, nodeId, 'flowTimeSpeed', 0);
        const flowTimeOffset = paramSlotExprWired(paramLayout, nodeId, 'flowTimeOffset', 0);
        const flowOctavesF = paramSlotExprWired(paramLayout, nodeId, 'flowOctaves', 0);
        const flowGain = paramSlotExprWired(paramLayout, nodeId, 'flowGain', 0);
        const flowIntensity = paramSlotExprWired(paramLayout, nodeId, 'flowIntensity', 0);

        requireHelper(
          'flow-field-pattern',
          `
fn flowHash(n: f32) -> f32 {
  return fract(sin(n) * 43758.5453);
}

fn flowVnoise(p: vec3<f32>) -> f32 {
  let ip = floor(p);
  var fp = fract(p);
  fp = fp * fp * (3.0 - 2.0 * fp);

  let n000 = flowHash(dot(ip + vec3<f32>(0.0, 0.0, 0.0), vec3<f32>(1.0, 57.0, 113.0)));
  let n100 = flowHash(dot(ip + vec3<f32>(1.0, 0.0, 0.0), vec3<f32>(1.0, 57.0, 113.0)));
  let n010 = flowHash(dot(ip + vec3<f32>(0.0, 1.0, 0.0), vec3<f32>(1.0, 57.0, 113.0)));
  let n110 = flowHash(dot(ip + vec3<f32>(1.0, 1.0, 0.0), vec3<f32>(1.0, 57.0, 113.0)));
  let n001 = flowHash(dot(ip + vec3<f32>(0.0, 0.0, 1.0), vec3<f32>(1.0, 57.0, 113.0)));
  let n101 = flowHash(dot(ip + vec3<f32>(1.0, 0.0, 1.0), vec3<f32>(1.0, 57.0, 113.0)));
  let n011 = flowHash(dot(ip + vec3<f32>(0.0, 1.0, 1.0), vec3<f32>(1.0, 57.0, 113.0)));
  let n111 = flowHash(dot(ip + vec3<f32>(1.0, 1.0, 1.0), vec3<f32>(1.0, 57.0, 113.0)));

  let x00 = mix(n000, n100, fp.x);
  let x10 = mix(n010, n110, fp.x);
  let x01 = mix(n001, n101, fp.x);
  let x11 = mix(n011, n111, fp.x);
  let y0 = mix(x00, x10, fp.y);
  let y1 = mix(x01, x11, fp.y);
  return mix(y0, y1, fp.z) * 2.0 - 1.0;
}

fn flowCurl(p: vec3<f32>, eps: f32) -> vec2<f32> {
  let F = flowVnoise(p);
  let Fx = flowVnoise(p + vec3<f32>(eps, 0.0, 0.0));
  let Fy = flowVnoise(p + vec3<f32>(0.0, eps, 0.0));
  let dFdx = (Fx - F) / eps;
  let dFdy = (Fy - F) / eps;
  return vec2<f32>(dFdy, -dFdx);
}
          `
        );

        const flowTime = `(globals.v0.x + ${flowTimeOffset}) * ${flowTimeSpeed}`;
        const eps = `(0.02 * ${flowCurlScale})`;
        const uv = `(${uvIn.code} * ${flowScale})`;

        const octF = `clamp(${flowOctavesF}, 1.0, 6.0)`;
        const octI = `i32(${octF} + 0.5)`;

        // Unrolled up to 6 octaves (matches node spec loop bound).
        const curlSum = `
(
  (select(vec2<f32>(0.0, 0.0), flowCurl(vec3<f32>(${uv} * 1.0, ${flowTime} * 0.1 + 0.0 * 0.17), ${eps} / 1.0) * 1.0, 0 < ${octI})) +
  (select(vec2<f32>(0.0, 0.0), flowCurl(vec3<f32>(${uv} * 2.0, ${flowTime} * 0.1 + 1.0 * 0.17), ${eps} / 2.0) * (${flowGain}), 1 < ${octI})) +
  (select(vec2<f32>(0.0, 0.0), flowCurl(vec3<f32>(${uv} * 4.0, ${flowTime} * 0.1 + 2.0 * 0.17), ${eps} / 4.0) * (${flowGain} * ${flowGain}), 2 < ${octI})) +
  (select(vec2<f32>(0.0, 0.0), flowCurl(vec3<f32>(${uv} * 8.0, ${flowTime} * 0.1 + 3.0 * 0.17), ${eps} / 8.0) * (${flowGain} * ${flowGain} * ${flowGain}), 3 < ${octI})) +
  (select(vec2<f32>(0.0, 0.0), flowCurl(vec3<f32>(${uv} * 16.0, ${flowTime} * 0.1 + 4.0 * 0.17), ${eps} / 16.0) * (${flowGain} * ${flowGain} * ${flowGain} * ${flowGain}), 4 < ${octI})) +
  (select(vec2<f32>(0.0, 0.0), flowCurl(vec3<f32>(${uv} * 32.0, ${flowTime} * 0.1 + 5.0 * 0.17), ${eps} / 32.0) * (${flowGain} * ${flowGain} * ${flowGain} * ${flowGain} * ${flowGain}), 5 < ${octI}))
)
        `.replaceAll('\n', ' ');

        const flowMag = `length(${curlSum})`;
        const value = `(0.5 + 0.5 * smoothstep(0.0, 1.5, ${flowMag}))`;
        setNodeOut(nodeId, 'out', { type: 'f32', code: `(${value} * ${flowIntensity})` });
        break;
      }
      case 'fractal': {
        const pIn = resolveInputVec2(nodeId, 'in');
        if (!pIn) break;

        const intensity = paramSlotExprWired(paramLayout, nodeId, 'fractalIntensity', 0);
        const layers = paramSlotExprWired(paramLayout, nodeId, 'fractalLayers', 0);
        const iterationsF = paramSlotExprWired(paramLayout, nodeId, 'fractalIterations', 0);
        const timeOffset = paramSlotExprWired(paramLayout, nodeId, 'fractalTimeOffset', 0);
        const animationSpeed = paramSlotExprWired(paramLayout, nodeId, 'fractalAnimationSpeed', 0);
        const rotationSpeed = paramSlotExprWired(paramLayout, nodeId, 'fractalRotationSpeed', 0);
        const layerPhase = paramSlotExprWired(paramLayout, nodeId, 'fractalLayerPhase', 0);

        requireHelper(
          'fractal',
          `
fn fractalDeformWgsl(p: vec2<f32>, time: f32, intensity: f32, layers: f32, iterations: i32, timeOffset: f32, animationSpeed: f32, rotationSpeed: f32, layerPhase: f32) -> f32 {
  var z = p;
  var scale = 1.0;
  var value = 0.0;
  let layerScale = max(layers, 0.0001);
  let t = (time + timeOffset) * animationSpeed;

  for (var i = 0; i < 16; i = i + 1) {
    if (i >= iterations) { break; }

    let angle = t * rotationSpeed + f32(i) * layerPhase;
    let c = cos(angle);
    let s = sin(angle);
    z = vec2<f32>(z.x * c - z.y * s, z.x * s + z.y * c);

    z = abs(z);
    if (z.x < z.y) {
      z = z.yx;
    }
    z = z * layerScale - vec2<f32>(1.0, 1.0);
    scale = scale * layerScale;

    value = value + exp(-length(z) * scale);
  }

  return value * intensity;
}
          `
        );

        const iterations = `clamp(i32(${iterationsF} + 0.5), 1, 16)`;
        const value = `fractalDeformWgsl(${pIn.code} * 2.0, globals.v0.x, ${intensity}, ${layers}, ${iterations}, ${timeOffset}, ${animationSpeed}, ${rotationSpeed}, ${layerPhase})`;
        setNodeOut(nodeId, 'out', { type: 'f32', code: `(${value} * 0.3)` });
        break;
      }
      case 'radial-rays': {
        const pIn = resolveInputVec2(nodeId, 'in');
        if (!pIn) break;

        const cx = paramSlotExprWired(paramLayout, nodeId, 'centerX', 0);
        const cy = paramSlotExprWired(paramLayout, nodeId, 'centerY', 0);
        const rayCountF = paramSlotExprWired(paramLayout, nodeId, 'rayCount', 0);
        const spreadDeg = paramSlotExprWired(paramLayout, nodeId, 'spreadAngle', 0);
        const width = paramSlotExprWired(paramLayout, nodeId, 'width', 0);
        const falloff = paramSlotExprWired(paramLayout, nodeId, 'falloff', 0);
        const rotationDeg = paramSlotExprWired(paramLayout, nodeId, 'rotation', 0);
        const intensity = paramSlotExprWired(paramLayout, nodeId, 'intensity', 0);

        requireHelper('wgslMod', WGSL_HELPER_WGSL_MOD);
        requireHelper(
          'radial-rays',
          `
fn radialRays(p: vec2<f32>, center: vec2<f32>, rayCountF: f32, spreadDeg: f32, width: f32, falloff: f32, rotationDeg: f32) -> f32 {
  let d = p - center;
  let angle = atan2(d.y, d.x) + rotationDeg * 0.017453292519943295;
  let angleNorm = wgslMod(angle + 3.141592653589793, 6.283185307179586) / 6.283185307179586;
  let spreadNorm = spreadDeg / 360.0;
  if (angleNorm > spreadNorm) { return 0.0; }

  let rayCount = max(rayCountF, 1.0);
  let t = fract(angleNorm / max(spreadNorm, 0.001) * rayCount);
  let distFromCenter = min(t, 1.0 - t) * 2.0;
  return 1.0 - smoothstep(width, width + falloff, distFromCenter);
}
          `
        );

        const center = `vec2<f32>(${cx}, ${cy})`;
        const ray = `radialRays(${pIn.code}, ${center}, ${rayCountF}, ${spreadDeg}, ${width}, ${falloff}, ${rotationDeg})`;
        setNodeOut(nodeId, 'out', { type: 'f32', code: `(${ray} * ${intensity})` });
        break;
      }
      case 'streak': {
        const pIn = resolveInputVec2(nodeId, 'in');
        if (!pIn) break;

        const angleDeg = paramSlotExprWired(paramLayout, nodeId, 'streakAngleDeg', 0);
        const angle = `(${angleDeg}) * 0.017453292519943295`;
        const stretch = `max(${paramSlotExprWired(paramLayout, nodeId, 'streakStretch', 0)}, 0.2)`;
        const width = `max(${paramSlotExprWired(paramLayout, nodeId, 'streakWidth', 0)}, 0.01)`;
        const falloffK = `max(${paramSlotExprWired(paramLayout, nodeId, 'streakFalloff', 0)}, 0.1)`;
        const intensity = paramSlotExprWired(paramLayout, nodeId, 'streakIntensity', 0);

        const axis = `vec2<f32>(cos(${angle}), sin(${angle}))`;
        const perpAxis = `vec2<f32>(-sin(${angle}), cos(${angle}))`;
        const along = `dot(${pIn.code}, ${axis})`;
        const perp = `dot(${pIn.code}, ${perpAxis})`;
        const d2 = `(${perp} * ${perp}) / (${width} * ${width})`;
        const falloff = `exp(-pow(${d2}, 1.0 / ${falloffK}))`;
        const alongFalloff = `(1.0 - smoothstep(0.0, ${stretch} * ${falloffK}, abs(${along})))`;
        setNodeOut(nodeId, 'out', { type: 'f32', code: `(${falloff} * ${alongFalloff} * ${intensity})` });
        break;
      }
      case 'iterated-inversion': {
        const uvIn = resolveInputVec2(nodeId, 'in');
        if (!uvIn) break;

        const iterationsF = paramSlotExprWired(paramLayout, nodeId, 'iteratedInversionIterations', 0);
        const timeSpeed = paramSlotExprWired(paramLayout, nodeId, 'iteratedInversionTimeSpeed', 0);
        const twist = paramSlotExprWired(paramLayout, nodeId, 'iteratedInversionTwist', 0);
        const orbitRadius = paramSlotExprWired(paramLayout, nodeId, 'iteratedInversionOrbitRadius', 0);
        const scale = paramSlotExprWired(paramLayout, nodeId, 'iteratedInversionScale', 0);
        const panX = paramSlotExprWired(paramLayout, nodeId, 'iteratedInversionPanX', 0);
        const panY = paramSlotExprWired(paramLayout, nodeId, 'iteratedInversionPanY', 0);
        const blobStrength = paramSlotExprWired(paramLayout, nodeId, 'iteratedInversionBlobStrength', 0);
        const blobSharpness = paramSlotExprWired(paramLayout, nodeId, 'iteratedInversionBlobSharpness', 0);
        const hueOffset = paramSlotExprWired(paramLayout, nodeId, 'iteratedInversionHueOffset', 0);
        const hueSpread = paramSlotExprWired(paramLayout, nodeId, 'iteratedInversionHueSpread', 0);
        const hueAngle = paramSlotExprWired(paramLayout, nodeId, 'iteratedInversionHueAngle', 0);
        const exposure = paramSlotExprWired(paramLayout, nodeId, 'iteratedInversionExposure', 0);

        requireHelper(
          'iterated-inversion',
          `
fn iterInvHueToRgb(h: f32) -> vec3<f32> {
  let k = vec3<f32>(1.0, 0.6666667, 0.3333333);
  let p = abs(fract(vec3<f32>(h) + k) * 6.0 - vec3<f32>(3.0));
  return clamp(p - vec3<f32>(1.0), vec3<f32>(0.0), vec3<f32>(1.0));
}

fn iterInvColor(p: vec2<f32>, time: f32, maxIter: i32, timeSpeed: f32, twist: f32, orbitRadius: f32, blobStrength: f32, blobSharpness: f32, hueOffset: f32, hueSpread: f32, hueAngle: f32) -> vec3<f32> {
  var col = vec3<f32>(0.0, 0.0, 0.0);
  let t = time * timeSpeed;
  let c = orbitRadius * vec2<f32>(cos(t), sin(t));

  for (var i = 0; i < 64; i = i + 1) {
    if (i >= maxIter) { break; }

    var z = p - c;
    let r = length(z);
    let rInv = 1.0 / max(r, 0.001);
    let zpX = z.x * rInv;
    let zpY = z.y * rInv;
    let twistR = twist * r;
    let sinTwistR = sin(twistR);
    let cosTwistR = cos(twistR);
    let sinAngleTwisted = zpY * cosTwistR + zpX * sinTwistR;
    let angle = atan2(z.y, z.x) + twistR;
    z = rInv * vec2<f32>(cos(angle), sin(angle));
    z = z + c;

    let hueSwirl = hueAngle * (3.141592653589793 * sinAngleTwisted);
    let h = hueOffset + f32(i) * hueSpread + hueSwirl;
    let hue = iterInvHueToRgb(fract(h));
    let g = exp(-blobSharpness * dot(z, z));
    col = col - blobStrength * g * hue;
  }

  return col;
}
          `
        );

        const aspect = `(globals.v0.z / max(1.0, globals.v0.w))`;
        const pan = `vec2<f32>(clamp(${panX}, -2.0, 2.0), clamp(${panY}, -2.0, 2.0))`;
        const p = `((${uvIn.code} - vec2<f32>(0.5, 0.5)) * vec2<f32>(${aspect}, 1.0) * clamp(${scale}, 0.3, 3.0) - ${pan})`;
        const iterations = `clamp(i32(${iterationsF} + 0.5), 1, 64)`;
        const col = `iterInvColor(${p}, globals.v0.x, ${iterations}, clamp(${timeSpeed}, 0.0, 5.0), ${twist}, clamp(${orbitRadius}, 0.05, 0.9), clamp(${blobStrength}, 0.0, 2.0), clamp(${blobSharpness}, 0.5, 30.0), fract(${hueOffset}), clamp(${hueSpread}, 0.0, 0.1), clamp(${hueAngle}, 0.0, 0.5))`;
        setNodeOut(nodeId, 'out', {
          type: 'vec3<f32>',
          code: `clamp(vec3<f32>(0.5, 0.5, 0.5) + vec3<f32>(0.5) * clamp(${exposure}, 0.2, 3.0) * ${col}, vec3<f32>(0.0), vec3<f32>(1.0))`,
        });
        break;
      }
      case 'tone-mapping': {
        const cIn = resolveInputVec3(nodeId, 'in');
        if (!cIn) break;

        const exposure = paramSlotExprWired(paramLayout, nodeId, 'exposure', 0);
        const contrast = paramSlotExprWired(paramLayout, nodeId, 'contrast', 0);
        const saturation = paramSlotExprWired(paramLayout, nodeId, 'saturation', 0);

        requireHelper(
          'tone-mapping',
          `
fn luminance299(color: vec3<f32>) -> f32 {
  return dot(color, vec3<f32>(0.299, 0.587, 0.114));
}
          `
        );

        const color = `((${cIn.code}) * ${exposure})`;
        const contrasted = `(((${color}) - vec3<f32>(0.5)) * ${contrast} + vec3<f32>(0.5))`;
        const lum = `luminance299(${contrasted})`;
        const saturated = `mix(vec3<f32>(${lum}), ${contrasted}, ${saturation})`;
        setNodeOut(nodeId, 'out', { type: 'vec3<f32>', code: `clamp(${saturated}, vec3<f32>(0.0), vec3<f32>(1.0))` });
        break;
      }
      case 'color-grading': {
        const cIn = resolveInputVec4(nodeId, 'in');
        if (!cIn) break;

        const shadows = `vec3<f32>(${paramSlotExprWired(paramLayout, nodeId, 'colorShadowsR', 0)}, ${paramSlotExprWired(paramLayout, nodeId, 'colorShadowsG', 0)}, ${paramSlotExprWired(paramLayout, nodeId, 'colorShadowsB', 0)})`;
        const midtones = `vec3<f32>(${paramSlotExprWired(paramLayout, nodeId, 'colorMidtonesR', 0)}, ${paramSlotExprWired(paramLayout, nodeId, 'colorMidtonesG', 0)}, ${paramSlotExprWired(paramLayout, nodeId, 'colorMidtonesB', 0)})`;
        const highlights = `vec3<f32>(${paramSlotExprWired(paramLayout, nodeId, 'colorHighlightsR', 0)}, ${paramSlotExprWired(paramLayout, nodeId, 'colorHighlightsG', 0)}, ${paramSlotExprWired(paramLayout, nodeId, 'colorHighlightsB', 0)})`;

        const inMin = paramSlotExprWired(paramLayout, nodeId, 'levelsInMin', 0);
        const inMax = paramSlotExprWired(paramLayout, nodeId, 'levelsInMax', 0);
        const outMin = paramSlotExprWired(paramLayout, nodeId, 'levelsOutMin', 0);
        const outMax = paramSlotExprWired(paramLayout, nodeId, 'levelsOutMax', 0);
        const gamma = paramSlotExprWired(paramLayout, nodeId, 'levelsGamma', 0);

        requireHelper(
          'color-grading',
          `
fn safeDenom(x: f32) -> f32 {
  if (abs(x) < 1e-6) { return select(1e-6, -1e-6, x < 0.0); }
  return x;
}

fn luminance709(color: vec3<f32>) -> f32 {
  return dot(color, vec3<f32>(0.2126, 0.7152, 0.0722));
}

fn applyColorCurve(colorIn: vec3<f32>, shadows: vec3<f32>, midtones: vec3<f32>, highlights: vec3<f32>) -> vec3<f32> {
  let lum = luminance709(colorIn);
  var adjusted = colorIn;
  let shadowMask = 1.0 - smoothstep(0.0, 0.33, lum);
  adjusted = mix(adjusted, adjusted * shadows, shadowMask);
  let midtoneMask = smoothstep(0.0, 0.33, lum) * (1.0 - smoothstep(0.33, 0.66, lum));
  adjusted = mix(adjusted, adjusted * midtones, midtoneMask);
  let highlightMask = smoothstep(0.33, 1.0, lum);
  adjusted = mix(adjusted, adjusted * highlights, highlightMask);
  return adjusted;
}

fn applyLevels1(valueIn: f32, inMin: f32, inMax: f32, outMin: f32, outMax: f32, gamma: f32) -> f32 {
  var v = clamp((valueIn - inMin) / safeDenom(inMax - inMin), 0.0, 1.0);
  v = pow(v, 1.0 / max(gamma, 1e-6));
  return v * (outMax - outMin) + outMin;
}

fn applyLevels3(color: vec3<f32>, inMin: f32, inMax: f32, outMin: f32, outMax: f32, gamma: f32) -> vec3<f32> {
  return vec3<f32>(
    applyLevels1(color.x, inMin, inMax, outMin, outMax, gamma),
    applyLevels1(color.y, inMin, inMax, outMin, outMax, gamma),
    applyLevels1(color.z, inMin, inMax, outMin, outMax, gamma)
  );
}
          `
        );

        const rgb = `${cIn.code}.xyz`;
        const graded = `applyColorCurve(${rgb}, ${shadows}, ${midtones}, ${highlights})`;
        const leveled = `applyLevels3(${graded}, ${inMin}, ${inMax}, ${outMin}, ${outMax}, ${gamma})`;
        setNodeOut(nodeId, 'out', { type: 'vec4<f32>', code: `vec4<f32>(${leveled}, ${cIn.code}.w)` });
        break;
      }
      case 'oklch-color-map-bezier': {
        // Match GLSL `generatePromotionCode`: vec2/vec3/vec4 → float uses `.x`.
        const v = resolveInputF32(nodeId, 'in');
        if (!v) break;

        const startColor = resolveInputVec3WithFallback(nodeId, 'startColor', [
          'startColorL',
          'startColorC',
          'startColorH',
        ]);
        const endColor = resolveInputVec3WithFallback(nodeId, 'endColor', ['endColorL', 'endColorC', 'endColorH']);
        if (!startColor || !endColor) break;
        const lCurve = resolveInputVec4WithFallback(nodeId, 'lCurve', ['lCurveX1', 'lCurveY1', 'lCurveX2', 'lCurveY2']);
        const cCurve = resolveInputVec4WithFallback(nodeId, 'cCurve', ['cCurveX1', 'cCurveY1', 'cCurveX2', 'cCurveY2']);
        const hCurve = resolveInputVec4WithFallback(nodeId, 'hCurve', ['hCurveX1', 'hCurveY1', 'hCurveX2', 'hCurveY2']);
        if (!lCurve || !cCurve || !hCurve) break;

        const reverseHue = paramSlotExprWired(paramLayout, nodeId, 'reverseHue', 0);

        requireHelper('wgslMod', WGSL_HELPER_WGSL_MOD);
        requireHelper(
          'oklch-color-map-common',
          `
fn oklchToRgb(oklch: vec3<f32>) -> vec3<f32> {
  let l = oklch.x;
  let c = oklch.y;
  let h = oklch.z * 3.14159265359 / 180.0;
  let a = c * cos(h);
  let b = c * sin(h);
  let l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  let m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  let s_ = l - 0.0894841775 * a - 1.2914855480 * b;
  let l3 = l_ * l_ * l_;
  let m3 = m_ * m_ * m_;
  let s3 = s_ * s_ * s_;
  let r = 4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3;
  let g = -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3;
  let bl = -0.0041960863 * l3 - 0.7034186147 * m3 + 1.7076147010 * s3;
  return clamp(vec3<f32>(r, g, bl), vec3<f32>(0.0), vec3<f32>(1.0));
}

fn cubicBezier(x: f32, curve: vec4<f32>) -> f32 {
  if (x <= 0.0) { return 0.0; }
  if (x >= 1.0) { return 1.0; }
  var t0 = 0.0;
  var t1 = 1.0;
  for (var i = 0; i < 10; i = i + 1) {
    let t = (t0 + t1) * 0.5;
    let u = 1.0 - t;
    let tt = t * t;
    let uu = u * u;
    let xt = 3.0 * uu * t * curve.x + 3.0 * u * tt * curve.z + tt * t;
    if (xt < x) { t0 = t; } else { t1 = t; }
  }
  let t = (t0 + t1) * 0.5;
  let u = 1.0 - t;
  let tt = t * t;
  let uu = u * u;
  return 3.0 * uu * t * curve.y + 3.0 * u * tt * curve.w + tt * t;
}

fn interpolateHue(startH: f32, endH: f32, t: f32, reverseHue: f32) -> f32 {
  let rev = reverseHue > 0.5;
  let adjustedEndH = select(select(endH, endH + 360.0, endH < startH), select(endH, endH - 360.0, endH > startH), rev);
  var h = mix(startH, adjustedEndH, t);
  h = wgslMod(h, 360.0);
  if (h < 0.0) { h = h + 360.0; }
  return h;
}
          `
        );

        const value = `clamp(${v.code}, 0.0, 1.0)`;
        const lT = `cubicBezier(${value}, ${lCurve.code})`;
        const cT = `cubicBezier(${value}, ${cCurve.code})`;
        const hT = `cubicBezier(${value}, ${hCurve.code})`;
        const l = `mix((${startColor.code}).x, (${endColor.code}).x, ${lT})`;
        const c = `mix((${startColor.code}).y, (${endColor.code}).y, ${cT})`;
        const h = `interpolateHue((${startColor.code}).z, (${endColor.code}).z, ${hT}, ${reverseHue})`;
        const rgb = `oklchToRgb(vec3<f32>(${l}, ${c}, ${h}))`;
        setNodeOut(nodeId, 'out', { type: 'vec3<f32>', code: rgb });
        break;
      }
      case 'oklch-color-map-threshold': {
        const v = resolveInputF32(nodeId, 'in');
        if (!v) break;

        // Match the GLSL node implementation: it uses *parameters* for start/end colors,
        // even if the startColor/endColor ports are connected.
        const startColor = {
          type: 'vec3<f32>',
          code: `vec3<f32>(${paramSlotExprWired(paramLayout, nodeId, 'startColorL', 0)}, ${paramSlotExprWired(paramLayout, nodeId, 'startColorC', 0)}, ${paramSlotExprWired(paramLayout, nodeId, 'startColorH', 0)})`,
        } satisfies Expr;
        const endColor = {
          type: 'vec3<f32>',
          code: `vec3<f32>(${paramSlotExprWired(paramLayout, nodeId, 'endColorL', 0)}, ${paramSlotExprWired(paramLayout, nodeId, 'endColorC', 0)}, ${paramSlotExprWired(paramLayout, nodeId, 'endColorH', 0)})`,
        } satisfies Expr;
        const lCurve = resolveInputVec4WithFallback(nodeId, 'lCurve', ['lCurveX1', 'lCurveY1', 'lCurveX2', 'lCurveY2']);
        const cCurve = resolveInputVec4WithFallback(nodeId, 'cCurve', ['cCurveX1', 'cCurveY1', 'cCurveX2', 'cCurveY2']);
        const hCurve = resolveInputVec4WithFallback(nodeId, 'hCurve', ['hCurveX1', 'hCurveY1', 'hCurveX2', 'hCurveY2']);
        if (!lCurve || !cCurve || !hCurve) break;

        // Semantic defaults (not the GLSL-parity vec2(0.0)): fragCoord defaults to UV * resolution,
        // resolution defaults to globals.v0.zw. `tryResolveInputVec2` returns null when unconnected.
        const fragCoord =
          tryResolveInputVec2(nodeId, 'fragCoord') ??
          ({ type: 'vec2<f32>', code: `(in.uv * globals.v0.zw)` } satisfies Expr);
        const resolution =
          tryResolveInputVec2(nodeId, 'resolution') ??
          ({ type: 'vec2<f32>', code: `globals.v0.zw` } satisfies Expr);

        const stopsF = paramSlotExprWired(paramLayout, nodeId, 'stops', 0);
        const transWidthParam = paramSlotExprWired(paramLayout, nodeId, 'transitionWidth', 0);
        const ditherStrength = paramSlotExprWired(paramLayout, nodeId, 'ditherStrength', 0);
        const pixelSize = `max(${paramSlotExprWired(paramLayout, nodeId, 'pixelSize', 0)}, 0.0001)`;
        const reverseHue = paramSlotExprWired(paramLayout, nodeId, 'reverseHue', 0);

        requireHelper('wgslMod', WGSL_HELPER_WGSL_MOD);
        requireHelper(
          'oklch-color-map-common',
          `
fn oklchToRgb(oklch: vec3<f32>) -> vec3<f32> {
  let l = oklch.x;
  let c = oklch.y;
  let h = oklch.z * 3.14159265359 / 180.0;
  let a = c * cos(h);
  let b = c * sin(h);
  let l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  let m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  let s_ = l - 0.0894841775 * a - 1.2914855480 * b;
  let l3 = l_ * l_ * l_;
  let m3 = m_ * m_ * m_;
  let s3 = s_ * s_ * s_;
  let r = 4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3;
  let g = -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3;
  let bl = -0.0041960863 * l3 - 0.7034186147 * m3 + 1.7076147010 * s3;
  return clamp(vec3<f32>(r, g, bl), vec3<f32>(0.0), vec3<f32>(1.0));
}

fn cubicBezier(x: f32, curve: vec4<f32>) -> f32 {
  if (x <= 0.0) { return 0.0; }
  if (x >= 1.0) { return 1.0; }
  var t0 = 0.0;
  var t1 = 1.0;
  for (var i = 0; i < 10; i = i + 1) {
    let t = (t0 + t1) * 0.5;
    let u = 1.0 - t;
    let tt = t * t;
    let uu = u * u;
    let xt = 3.0 * uu * t * curve.x + 3.0 * u * tt * curve.z + tt * t;
    if (xt < x) { t0 = t; } else { t1 = t; }
  }
  let t = (t0 + t1) * 0.5;
  let u = 1.0 - t;
  let tt = t * t;
  let uu = u * u;
  return 3.0 * uu * t * curve.y + 3.0 * u * tt * curve.w + tt * t;
}

fn interpolateHue(startH: f32, endH: f32, t: f32, reverseHue: f32) -> f32 {
  let rev = reverseHue > 0.5;
  let adjustedEndH = select(select(endH, endH + 360.0, endH < startH), select(endH, endH - 360.0, endH > startH), rev);
  var h = mix(startH, adjustedEndH, t);
  h = wgslMod(h, 360.0);
  if (h < 0.0) { h = h + 360.0; }
  return h;
}

fn generateColorStop(t: f32, startColor: vec3<f32>, endColor: vec3<f32>, lCurve: vec4<f32>, cCurve: vec4<f32>, hCurve: vec4<f32>, reverseHue: f32) -> vec3<f32> {
  let lT = cubicBezier(t, lCurve);
  let cT = cubicBezier(t, cCurve);
  let hT = cubicBezier(t, hCurve);
  let l = mix(startColor.x, endColor.x, lT);
  let c = mix(startColor.y, endColor.y, cT);
  let h = interpolateHue(startColor.z, endColor.z, hT, reverseHue);
  return vec3<f32>(l, c, h);
}

fn bayer2(aIn: vec2<f32>) -> f32 {
  let a = floor(aIn);
  return fract(a.x / 2.0 + a.y * a.y * 0.75);
}

fn bayer4(a: vec2<f32>) -> f32 {
  return bayer2(0.5 * a) * 0.25 + bayer2(a);
}

fn bayer8(a: vec2<f32>) -> f32 {
  return bayer4(0.5 * a) * 0.25 + bayer2(a);
}
          `
        );

        const value = `clamp(${v.code}, 0.0, 1.0)`;
        const stopsI = `i32(clamp(${stopsF}, 2.0, 50.0) + 0.5)`;

        const bayerEnabled = `(${ditherStrength} > 0.001)`;
        const fragCoordCentered = `(${fragCoord.code} - ${resolution.code} * 0.5)`;
        const bayer = `select(0.0, ((bayer8(${fragCoordCentered} / ${pixelSize}) - 0.5) * ${ditherStrength}), ${bayerEnabled})`;

        const transWidth = `select(0.005, ${transWidthParam}, ${transWidthParam} > 0.0)`;
        const ditheredValue = `clamp(${value} + ${bayer}, 0.0, 1.0)`;

        const colorIndex = `(${ditheredValue} * f32(${stopsI} - 1))`;
        const lowerIndex = `clamp(i32(floor(${colorIndex})), 0, ${stopsI} - 1)`;
        const upperIndex = `clamp(min(${lowerIndex} + 1, ${stopsI} - 1), 0, ${stopsI} - 1)`;
        const lowerT = `(f32(${lowerIndex}) / f32(${stopsI} - 1))`;
        const upperT = `(f32(${upperIndex}) / f32(${stopsI} - 1))`;

        const oklch1 = `generateColorStop(${lowerT}, ${startColor.code}, ${endColor.code}, ${lCurve.code}, ${cCurve.code}, ${hCurve.code}, ${reverseHue})`;
        const oklch2 = `generateColorStop(${upperT}, ${startColor.code}, ${endColor.code}, ${lCurve.code}, ${cCurve.code}, ${hCurve.code}, ${reverseHue})`;

        const hasUpper = `(${lowerIndex} < (${stopsI} - 1))`;
        const threshold = `clamp((f32(${lowerIndex} + 1) / f32(${stopsI}) + ${bayer} * 0.05), 0.0, 1.0)`;
        const smoothBlend = `smoothstep(${threshold} - ${transWidth}, ${threshold} + ${transWidth}, ${ditheredValue})`;
        const blendFactor = `select(0.0, ${smoothBlend}, ${hasUpper})`;

        const color1 = `oklchToRgb(${oklch1})`;
        const color2 = `oklchToRgb(${oklch2})`;
        setNodeOut(nodeId, 'out', { type: 'vec3<f32>', code: `mix(${color1}, ${color2}, ${blendFactor})` });
        break;
      }
      case 'combine-vector': {
        const x = resolveInputF32(nodeId, 'x', 'x');
        const y = resolveInputF32(nodeId, 'y', 'y');
        const zIn = resolveInputF32(nodeId, 'z', 'z');
        const wIn = resolveInputF32(nodeId, 'w', 'w');
        if (!x || !y || !zIn || !wIn) break;

        // Match GLSL node behavior: outputType controls whether z/w are used.
        // outputType: 2 -> vec4(x,y,0,1), 3 -> vec4(x,y,z,1), 4 -> vec4(x,y,z,w)
        const outType = paramSlotExprWired(paramLayout, nodeId, 'outputType', 0);
        const is2 = `(${outType} < 2.5)`;
        const is4 = `(${outType} >= 3.5)`;

        const z = `select(${zIn.code}, 0.0, ${is2})`;
        const w = `select(1.0, ${wIn.code}, ${is4})`;
        // (is3 is implicit: z uses zIn, w uses 1.0)
        setNodeOut(nodeId, 'out', { type: 'vec4<f32>', code: `vec4<f32>(${x.code}, ${y.code}, ${z}, ${w})` });
        break;
      }
      case 'split-vector': {
        const v = resolveInputVec4(nodeId, 'in');
        if (!v) break;
        setNodeOut(nodeId, 'x', { type: 'f32', code: `${v.code}.x` });
        setNodeOut(nodeId, 'y', { type: 'f32', code: `${v.code}.y` });
        setNodeOut(nodeId, 'z', { type: 'f32', code: `${v.code}.z` });
        setNodeOut(nodeId, 'w', { type: 'f32', code: `${v.code}.w` });
        break;
      }
      case 'swizzle': {
        const v = resolveInputVec4(nodeId, 'in');
        if (!v) break;
        const raw = node.parameters['swizzle'];
        const sw = typeof raw === 'string' ? raw : 'xyzw';
        const norm = sw
          .replaceAll('r', 'x')
          .replaceAll('g', 'y')
          .replaceAll('b', 'z')
          .replaceAll('a', 'w');
        const patt = norm.trim();
        // Keep it conservative: support a few common patterns (matching the GLSL node behavior),
        // otherwise pass through unchanged.
        if (patt === 'xy') {
          setNodeOut(nodeId, 'out', { type: 'vec4<f32>', code: `vec4<f32>(${v.code}.xy, 0.0, 1.0)` });
        } else if (patt === 'yx') {
          setNodeOut(nodeId, 'out', { type: 'vec4<f32>', code: `vec4<f32>(${v.code}.yx, 0.0, 1.0)` });
        } else if (patt === 'xyz') {
          setNodeOut(nodeId, 'out', { type: 'vec4<f32>', code: `vec4<f32>(${v.code}.xyz, 1.0)` });
        } else if (patt === 'zyx') {
          setNodeOut(nodeId, 'out', { type: 'vec4<f32>', code: `vec4<f32>(${v.code}.zyx, 1.0)` });
        } else if (patt === 'wzyx') {
          setNodeOut(nodeId, 'out', { type: 'vec4<f32>', code: `${v.code}.wzyx` });
        } else {
          setNodeOut(nodeId, 'out', { type: 'vec4<f32>', code: v.code });
        }
        break;
      }
      case 'arrangement-lanes': {
        const laneUv = resolveInputVec2(nodeId, 'in');
        if (!laneUv) break;

        const timeLinked = tryResolveInputF32(nodeId, 'time');
        const timelineTime = timeLinked ? timeLinked.code : 'globals.v0.y';

        const viewportMode = paramSlotExprWired(paramLayout, nodeId, 'viewportMode', 0);
        const windowSeconds = paramSlotExprWired(paramLayout, nodeId, 'windowSeconds', 0);
        const fixedStart = paramSlotExprWired(paramLayout, nodeId, 'fixedStartSeconds', 0);
        const colorSource = paramSlotExprWired(paramLayout, nodeId, 'colorSource', 0);
        const laneHeight = paramSlotExprWired(paramLayout, nodeId, 'laneHeight', 0);
        const laneSpacing = paramSlotExprWired(paramLayout, nodeId, 'laneSpacing', 0);
        const edgeFade = paramSlotExprWired(paramLayout, nodeId, 'edgeFade', 0);
        const opacity = paramSlotExprWired(paramLayout, nodeId, 'opacity', 0);
        const bgR = paramSlotExprWired(paramLayout, nodeId, 'backgroundR', 0);
        const bgG = paramSlotExprWired(paramLayout, nodeId, 'backgroundG', 0);
        const bgB = paramSlotExprWired(paramLayout, nodeId, 'backgroundB', 0);

        requireHelper(
          'arrangement-lanes-shared',
          `
fn arrangementLanesPaletteColorWgsl(colorIndex: f32, trackRow: f32, colorSource: f32) -> vec3<f32> {
  if (colorSource >= 0.5) {
    let hue = fract(colorIndex * 0.0625 + 0.02);
    return vec3<f32>(
      0.55 + 0.45 * cos(6.28318 * (hue + 0.0)),
      0.55 + 0.45 * cos(6.28318 * (hue + 0.33)),
      0.55 + 0.45 * cos(6.28318 * (hue + 0.66))
    );
  }
  let hue = fract(trackRow * 0.17 + 0.41);
  return vec3<f32>(
    0.5 + 0.5 * cos(6.28318 * (hue + 0.0)),
    0.5 + 0.5 * cos(6.28318 * (hue + 0.33)),
    0.5 + 0.5 * cos(6.28318 * (hue + 0.66))
  );
}

fn arrangementLanesEdgeFadeWgsl(uv: vec2<f32>, fadeAmount: f32) -> f32 {
  if (fadeAmount <= 0.0001) {
    return 1.0;
  }
  let edge = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));
  return smoothstep(0.0, fadeAmount, edge);
}

fn arrangementLanesScreenUvWgsl(inUv: vec2<f32>, uvInputMode: f32) -> vec2<f32> {
  if (uvInputMode < 0.5) {
    return inUv;
  }
  let aspect = globals.v0.z / max(1.0, globals.v0.w);
  return vec2<f32>(inUv.x / (2.0 * aspect) + 0.5, inUv.y * 0.5 + 0.5);
}
          `
        );

        const suffix = arrangementLanesGlslSuffix(nodeId);
        const packed = filterRegionsForNode(audioSetup?.arrangementSnapshot, node);
        requireHelper(`arrangement-lanes-${suffix}`, buildArrangementLanesWgslNodeHelper(nodeId, packed));

        const uvInputMode = paramSlotExprWired(paramLayout, nodeId, 'uvInputMode', 0);
        const laneUvNorm = `arrangementLanesScreenUvWgsl(${laneUv.code}, ${uvInputMode})`;
        const bg = `vec3<f32>(${bgR}, ${bgG}, ${bgB})`;
        const out = `evalArrangementLanes_${suffix}(${laneUvNorm}, ${timelineTime}, ${viewportMode}, ${windowSeconds}, ${fixedStart}, ${colorSource}, ${laneHeight}, ${laneSpacing}, ${edgeFade}, ${opacity}, ${bg})`;
        setNodeOut(nodeId, 'out', { type: 'vec4<f32>', code: out });
        break;
      }
      case 'arrangement-notes': {
        const noteUv = resolveInputVec2(nodeId, 'in');
        if (!noteUv) break;

        const timeLinked = tryResolveInputF32(nodeId, 'time');
        const timelineTime = timeLinked ? timeLinked.code : 'globals.v0.y';

        const viewportMode = paramSlotExprWired(paramLayout, nodeId, 'viewportMode', 0);
        const windowSeconds = paramSlotExprWired(paramLayout, nodeId, 'windowSeconds', 0);
        const fixedStart = paramSlotExprWired(paramLayout, nodeId, 'fixedStartSeconds', 0);
        const noteSize = paramSlotExprWired(paramLayout, nodeId, 'noteSize', 0);
        const velocityScale = paramSlotExprWired(paramLayout, nodeId, 'velocityScale', 0);
        const edgeFade = paramSlotExprWired(paramLayout, nodeId, 'edgeFade', 0);
        const opacity = paramSlotExprWired(paramLayout, nodeId, 'opacity', 0);
        const bgR = paramSlotExprWired(paramLayout, nodeId, 'backgroundR', 0);
        const bgG = paramSlotExprWired(paramLayout, nodeId, 'backgroundG', 0);
        const bgB = paramSlotExprWired(paramLayout, nodeId, 'backgroundB', 0);

        requireHelper(
          'arrangement-notes-shared',
          `
fn arrangementLanesEdgeFadeWgsl(uv: vec2<f32>, fadeAmount: f32) -> f32 {
  if (fadeAmount <= 0.0001) {
    return 1.0;
  }
  let edge = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));
  return smoothstep(0.0, fadeAmount, edge);
}

fn arrangementNotesScreenUvWgsl(inUv: vec2<f32>, uvInputMode: f32) -> vec2<f32> {
  if (uvInputMode < 0.5) {
    return inUv;
  }
  let aspect = globals.v0.z / max(1.0, globals.v0.w);
  return vec2<f32>(inUv.x / (2.0 * aspect) + 0.5, inUv.y * 0.5 + 0.5);
}
          `
        );

        const suffix = arrangementLanesGlslSuffix(nodeId);
        const packed = filterNotesForNode(audioSetup?.arrangementSnapshot, node);
        requireHelper(`arrangement-notes-${suffix}`, buildArrangementNotesWgslNodeHelper(nodeId, packed));

        const uvInputMode = paramSlotExprWired(paramLayout, nodeId, 'uvInputMode', 0);
        const laneUvNorm = `arrangementNotesScreenUvWgsl(${noteUv.code}, ${uvInputMode})`;
        const bg = `vec3<f32>(${bgR}, ${bgG}, ${bgB})`;
        const out = `evalArrangementNotes_${suffix}(${laneUvNorm}, ${timelineTime}, ${viewportMode}, ${windowSeconds}, ${fixedStart}, ${noteSize}, ${velocityScale}, ${edgeFade}, ${opacity}, ${bg})`;
        setNodeOut(nodeId, 'out', { type: 'vec4<f32>', code: out });
        break;
      }
      case 'final-output': {
        // handled below
        break;
      }
    }
  }

  const outNode = graph.nodes.find((n) => n.id === finalOutputNodeId);
  if (!outNode || outNode.type !== 'final-output') {
    return {
      backend: 'webgpu',
      supported: false,
      unsupportedReasons: ['missing final-output node'],
      code: '',
      shaderCode: '',
      uniforms: [],
      metadata: { warnings: [], errors: [], executionOrder, finalOutputNodeId: null },
      paramLayout: {},
      resources: [],
    };
  }

  const outLink = lookupInputConnection(graph, finalOutputNodeId, 'in');

  // Match `MainCodeGeneratorOutput.generateFinalColorVariable` (GLSL): unwired `final-output.in` → vec3(0).
  let colorVec4 = 'vec4<f32>(0.0, 0.0, 0.0, 1.0)';
  if (outLink) {
    const colorExpr = resolveNodeOut(outLink.sourceNodeId, outLink.sourcePort);
    if (!colorExpr) {
      return {
        backend: 'webgpu',
        supported: false,
        unsupportedReasons: ['could not resolve output expression'],
        code: '',
        shaderCode: '',
        uniforms: [],
        metadata: { warnings: [], errors: [], executionOrder, finalOutputNodeId },
        paramLayout: {},
        resources: [],
      };
    }

    // Match `final-output` NodeSpec contract: input is vec3 "Color".
    // The GLSL compiler coerces inputs to vec3; when a vec4 is connected, alpha is dropped.
    if (colorExpr.type === 'vec3<f32>') {
      colorVec4 = `vec4<f32>(${colorExpr.code}, 1.0)`;
    } else if (colorExpr.type === 'vec4<f32>') {
      colorVec4 = `vec4<f32>(${colorExpr.code}.xyz, 1.0)`;
    } else if (colorExpr.type === 'f32') {
      colorVec4 = `vec4<f32>(${colorExpr.code}, ${colorExpr.code}, ${colorExpr.code}, 1.0)`;
    }
  }

  const helpers = Array.from(helperFns.keys())
    .sort()
    .map((k) => helperFns.get(k))
    .filter((x): x is string => typeof x === 'string' && x.length > 0)
    .join('\n\n');
  // Keep whitespace stable for graphs without helpers (keeps snapshots stable).
  const helpersBlock = helpers.length > 0 ? `${helpers}\n` : '';

  const wgsl = `
struct Globals {
  v0 : vec4<f32>,
  v1 : vec4<f32>,
}

@group(0) @binding(0) var<uniform> globals : Globals;
@group(0) @binding(1) var<storage, read> params : array<vec4<f32>>;

struct VsOut {
  @builtin(position) pos : vec4<f32>,
  @location(0) uv : vec2<f32>,
}

@vertex
fn vs(@builtin(vertex_index) vid : u32) -> VsOut {
  var p = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>( 3.0, -1.0),
    vec2<f32>(-1.0,  3.0)
  );
  var o : VsOut;
  o.pos = vec4<f32>(p[vid], 0.0, 1.0);
  o.uv = (o.pos.xy * 0.5) + vec2<f32>(0.5, 0.5);
  return o;
}

${helpersBlock}@fragment
fn fs(in : VsOut) -> @location(0) vec4<f32> {
  return ${colorVec4};
}
`;

  return {
    backend: 'webgpu',
    supported: true,
    code: wgsl,
    shaderCode: '',
    uniforms,
    metadata: {
      warnings: [],
      errors: [],
      executionOrder,
      finalOutputNodeId,
    },
    paramLayout,
    resources: [],
  };
}

