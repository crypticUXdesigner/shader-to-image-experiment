import type { NodeSpec } from '../../types/nodeSpec';

/**
 * Disco Pattern node: diamond-grid pattern with per-cell hash color and edge term.
 * Outputs vec4(RGB, edge) for use in layered multiply effects (reference: Shadertoy ltfXzj).
 * Hash from Dave Hoskins https://www.shadertoy.com/view/4djSRW (inlined for self-contained node).
 */
export const discoPatternNodeSpec: NodeSpec = {
  id: 'disco-pattern',
  category: 'Patterns',
  displayName: 'Disco Pattern',
  description:
    'Diamond-grid pattern with per-cell hash color (RGB) and edge term (alpha). Useful as vec4 for multiply layers. Wiring straight to Output uses RGB only—the edge stays in alpha; use Mix, Blend Color, or masks to expose it.',
  icon: 'dots',
  inputs: [
    { name: 'in', type: 'vec2', label: 'UV' }
  ],
  outputs: [
    { name: 'out', type: 'vec4', label: 'Color' }
  ],
  parameters: {
    discoScale: {
      type: 'float',
      default: 1.0,
      min: 0.1,
      max: 20.0,
      step: 0.1,
      label: 'Scale'
    },
    phaseOffsetX: {
      type: 'float',
      default: 0.0,
      min: -10.0,
      max: 10.0,
      step: 0.01,
      label: 'Offset X',
      knobPolarity: 'two-sided'
    },
    phaseOffsetY: {
      type: 'float',
      default: 0.0,
      min: -10.0,
      max: 10.0,
      step: 0.01,
      label: 'Offset Y',
      knobPolarity: 'two-sided'
    }
  },
  parameterLayout: {
    elements: [
      {
        type: 'grid',
        parameters: ['discoScale', 'phaseOffsetX', 'phaseOffsetY'],
        layout: { columns: 'auto' }
      }
    ]
  },
  functions: `
vec3 discoHash32(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yxz + 19.19);
  return fract((p3.xxy + p3.yzz) * p3.zyx);
}
`,
  mainCode: `
  vec2 uv = $input.in * $param.discoScale + vec2($param.phaseOffsetX, $param.phaseOffsetY);
  vec2 cell = vec2(floor(uv.x - uv.y), floor(uv.x + uv.y));
  vec3 rgb = discoHash32(cell);
  float v = abs(cos(uv.x * 6.283185) + cos(uv.y * 6.283185)) * 0.5;
  $output.out = vec4(rgb, v);
  `
};
