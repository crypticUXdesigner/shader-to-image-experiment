/**
 * Eligibility policy tests for the Power button / bypass rules.
 *
 * Two layers:
 *  - Per-rule unit tests with synthetic minimal `NodeSpec` literals so the
 *    rule mechanics are easy to read.
 *  - A snapshot of the eligible node-id set built from `nodeSystemSpecs` so
 *    accidental category renames or surprise additions get caught.
 */
import { describe, it, expect } from 'vitest';
import type { NodeSpec, PortSpec, PortType } from '../types/nodeSpec';
import {
  POWER_ELIGIBLE_CATEGORIES,
  nodePowerRule,
  nodeSupportsPower,
} from './nodePower';
import { nodeSystemSpecs } from './nodes/index';

function port(name: string, type: PortType): PortSpec {
  return { name, type };
}

function makeSpec(partial: Partial<NodeSpec> & { category: string }): NodeSpec {
  return {
    id: partial.id ?? 'test',
    displayName: partial.displayName ?? 'Test',
    category: partial.category,
    inputs: partial.inputs ?? [],
    outputs: partial.outputs ?? [],
    parameters: partial.parameters ?? {},
    mainCode: partial.mainCode ?? '',
  };
}

describe('nodePowerRule', () => {
  it("returns 'none' when the spec has no outputs", () => {
    const spec = makeSpec({
      category: 'Output',
      inputs: [port('in', 'vec3')],
      outputs: [],
    });
    expect(nodePowerRule(spec)).toBe('none');
  });

  it("returns 'A' when first input and first output share a type (passthrough)", () => {
    const spec = makeSpec({
      category: 'Distort',
      inputs: [port('in', 'vec2')],
      outputs: [port('out', 'vec2')],
    });
    expect(nodePowerRule(spec)).toBe('A');
  });

  it("returns 'A' for multi-input nodes when only the first input matches the output type", () => {
    const spec = makeSpec({
      category: 'Effects',
      inputs: [port('color', 'vec3'), port('mask', 'float')],
      outputs: [port('out', 'vec3')],
    });
    expect(nodePowerRule(spec)).toBe('A');
  });

  it("returns 'B' when the spec has no inputs (generator)", () => {
    const spec = makeSpec({
      category: 'Inputs',
      inputs: [],
      outputs: [port('out', 'vec2')],
    });
    expect(nodePowerRule(spec)).toBe('B');
  });

  it("returns 'B' when first input type differs from first output type", () => {
    const spec = makeSpec({
      category: 'Patterns',
      inputs: [port('in', 'vec2')],
      outputs: [port('out', 'float')],
    });
    expect(nodePowerRule(spec)).toBe('B');
  });
});

describe('nodeSupportsPower', () => {
  it('is true for an eligible category that has a defined rule', () => {
    const spec = makeSpec({
      category: 'Distort',
      inputs: [port('in', 'vec2')],
      outputs: [port('out', 'vec2')],
    });
    expect(nodeSupportsPower(spec)).toBe(true);
  });

  it('is false for excluded categories even with a defined rule', () => {
    const math = makeSpec({
      category: 'Math',
      inputs: [port('a', 'float'), port('b', 'float')],
      outputs: [port('out', 'float')],
    });
    const utility = makeSpec({
      category: 'Utilities',
      inputs: [port('in', 'float')],
      outputs: [port('out', 'float')],
    });
    const mask = makeSpec({
      category: 'Mask',
      inputs: [port('a', 'float'), port('b', 'float')],
      outputs: [port('out', 'float')],
    });
    expect(nodeSupportsPower(math)).toBe(false);
    expect(nodeSupportsPower(utility)).toBe(false);
    expect(nodeSupportsPower(mask)).toBe(false);
  });

  it('is false when the rule is none, even if the category is eligible', () => {
    const spec = makeSpec({
      category: 'Effects',
      inputs: [port('in', 'vec3')],
      outputs: [],
    });
    expect(nodeSupportsPower(spec)).toBe(false);
  });
});

describe('eligibility for real specs', () => {
  const byId = new Map(nodeSystemSpecs.map((s) => [s.id, s]));

  function get(id: string): NodeSpec {
    const s = byId.get(id);
    if (!s) throw new Error(`spec not found: ${id}`);
    return s;
  }

  it('transform is Rule A and supports power', () => {
    const transform = get('transform');
    expect(nodePowerRule(transform)).toBe('A');
    expect(nodeSupportsPower(transform)).toBe(true);
  });

  it('noise is Rule B and supports power', () => {
    const noise = get('noise');
    expect(nodePowerRule(noise)).toBe('B');
    expect(nodeSupportsPower(noise)).toBe(true);
  });

  it('orbit-camera is Rule B and supports power (Inputs category, no inputs)', () => {
    const orbitCamera = get('orbit-camera');
    expect(nodePowerRule(orbitCamera)).toBe('B');
    expect(nodeSupportsPower(orbitCamera)).toBe(true);
  });

  it('blur is Rule A and supports power (Effects, vec3→vec3)', () => {
    const blur = get('blur');
    expect(nodePowerRule(blur)).toBe('A');
    expect(nodeSupportsPower(blur)).toBe(true);
  });

  it('add does not support power (Math)', () => {
    expect(nodeSupportsPower(get('add'))).toBe(false);
  });

  it('compare and select do not support power (Mask)', () => {
    expect(nodeSupportsPower(get('compare'))).toBe(false);
    expect(nodeSupportsPower(get('select'))).toBe(false);
  });

  it('one-minus does not support power (Utilities)', () => {
    expect(nodeSupportsPower(get('one-minus'))).toBe(false);
  });

  it('final-output reports rule none and does not support power', () => {
    const finalOutput = get('final-output');
    expect(nodePowerRule(finalOutput)).toBe('none');
    expect(nodeSupportsPower(finalOutput)).toBe(false);
  });
});

describe('eligible node ids — snapshot regression guard', () => {
  it('only the documented categories appear in the eligible set', () => {
    const eligibleCategories = new Set(
      nodeSystemSpecs.filter(nodeSupportsPower).map((s) => s.category)
    );
    for (const category of eligibleCategories) {
      expect(POWER_ELIGIBLE_CATEGORIES.has(category)).toBe(true);
    }
  });

  it('eligible node ids match the snapshot', () => {
    const eligibleIds = nodeSystemSpecs
      .filter(nodeSupportsPower)
      .map((s) => s.id)
      .sort();
    expect(eligibleIds).toMatchInlineSnapshot(`
      [
        "arrangement-lanes",
        "arrangement-notes",
        "bayer-dither",
        "bezier-curve",
        "blend-color",
        "blend-mode",
        "bloom-sphere",
        "blur",
        "bokeh",
        "bokeh-point",
        "box-torus-sdf",
        "brick-tiling",
        "chromatic-aberration",
        "color-grading",
        "constant-float",
        "constant-vec2",
        "constant-vec3",
        "constant-vec4",
        "crepuscular-rays",
        "cubic-curl-noise",
        "disco-pattern",
        "displace",
        "displacement-3d",
        "dots",
        "drive-home-lights",
        "edge-detection",
        "ether-sdf",
        "flow-field-pattern",
        "fractal",
        "fragment-coordinates",
        "generic-raymarcher",
        "glass-shell",
        "glow-bloom",
        "gradient",
        "hex-prism-sdf",
        "hexagonal-grid",
        "infinite-zoom",
        "inflated-icosahedron",
        "iridescent-tunnel",
        "iterated-inversion",
        "julia-slab-sdf",
        "kaleidoscope",
        "kifs-sdf",
        "lighting-shading",
        "look-at-camera",
        "mandelbox-sdf",
        "mandelbulb-sdf",
        "menger-sponge-sdf",
        "metaballs",
        "mixed-wave-signal",
        "noise",
        "normal-mapping",
        "oklch-color",
        "oklch-color-map-bezier",
        "oklch-color-map-threshold",
        "orbit-camera",
        "oscillator-2d",
        "particle-system",
        "plane-grid",
        "polar-coordinates",
        "quad-warp",
        "radial-pulse",
        "radial-rays",
        "radial-repeat-sdf",
        "radial-uv-warp",
        "rain-drops",
        "repeated-hex-prism-sdf",
        "resolution",
        "rgb-separation",
        "rings",
        "ripple",
        "scanlines",
        "shapes-2d",
        "sierpinski-tetra-sdf",
        "sky-dome",
        "sphere-raymarch",
        "spherical-fibonacci",
        "star-shape-2d",
        "streak",
        "stripes",
        "time",
        "tone-mapping",
        "transform",
        "triangle-grid",
        "turbulence",
        "uv-band-shift",
        "uv-block-glitch",
        "uv-coordinates",
        "vector-field",
        "volume-rays",
        "voronoi-noise",
        "vortex",
        "warp-terrain",
      ]
    `);
  });
});
