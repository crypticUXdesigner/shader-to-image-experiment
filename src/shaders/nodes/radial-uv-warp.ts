import type { NodeSpec } from '../../types/nodeSpec';

export const radialUvWarpNodeSpec: NodeSpec = {
  id: 'radial-uv-warp',
  category: 'Distort',
  displayName: 'Radial Warp',
  icon: 'aperture',
  description:
    'Bulge/pinch (localized radial warp), fisheye (lens-style), or spherize (hemisphere)—pick a mode.',
  inputs: [
    {
      name: 'in',
      type: 'vec2',
      label: 'UV',
    },
  ],
  outputs: [
    {
      name: 'out',
      type: 'vec2',
      label: 'UV',
    },
  ],
  parameters: {
    warpMode: {
      type: 'int',
      default: 0,
      min: 0,
      max: 2,
      step: 1,
      label: 'Mode',
    },
    warpCenterX: {
      type: 'float',
      default: 0.0,
      min: -2.0,
      max: 2.0,
      step: 0.1,
      label: 'Center X',
      knobPolarity: 'two-sided',
    },
    warpCenterY: {
      type: 'float',
      default: 0.0,
      min: -2.0,
      max: 2.0,
      step: 0.1,
      label: 'Center Y',
      knobPolarity: 'two-sided',
    },
    bulgeStrength: {
      type: 'float',
      default: 0.5,
      min: -2.0,
      max: 2.0,
      step: 0.01,
      label: 'Strength',
      knobPolarity: 'two-sided',
    },
    bulgeRadius: {
      type: 'float',
      default: 1.0,
      min: 0.01,
      max: 5.0,
      step: 0.01,
      label: 'Radius',
    },
    bulgeFalloff: {
      type: 'float',
      default: 1.0,
      min: 0.1,
      max: 5.0,
      step: 0.1,
      label: 'Falloff',
    },
    fisheyeStrength: {
      type: 'float',
      default: -0.3,
      min: -1.0,
      max: 1.0,
      step: 0.01,
      label: 'Strength',
      knobPolarity: 'two-sided',
    },
    fisheyeAspect: {
      type: 'float',
      default: 1.0,
      min: 0.2,
      max: 2.0,
      step: 0.01,
      label: 'Aspect',
    },
    spherizeRadius: {
      type: 'float',
      default: 1.0,
      min: 0.01,
      max: 3.0,
      step: 0.01,
      label: 'Radius',
    },
    spherizeStrength: {
      type: 'float',
      default: 1.0,
      min: 0.0,
      max: 1.0,
      step: 0.01,
      label: 'Strength',
    },
  },
  parameterLayout: {
    elements: [
      {
        type: 'grid',
        parameters: [
          'warpMode',
          'warpCenterX',
          'warpCenterY',
        ],
        parameterUI: { warpMode: 'enum', warpCenterX: 'coords', warpCenterY: 'coords' },
        layout: {
          columns: 2,
          coordsSpan: 2,
          parameterSpan: { warpMode: 2 },
        },
      },
      {
        type: 'grid',
        label: 'Bulge / pinch',
        visibleWhen: { parameter: 'warpMode', equals: 0 },
        parameters: ['bulgeStrength', 'bulgeRadius', 'bulgeFalloff'],
        layout: { columns: 2, parameterSpan: { bulgeStrength: 2 } },
      },
      {
        type: 'grid',
        label: 'Fisheye',
        visibleWhen: { parameter: 'warpMode', equals: 1 },
        parameters: ['fisheyeStrength', 'fisheyeAspect'],
        layout: { columns: 2 },
      },
      {
        type: 'grid',
        label: 'Spherize',
        visibleWhen: { parameter: 'warpMode', equals: 2 },
        parameters: ['spherizeRadius', 'spherizeStrength'],
        layout: { columns: 2 },
      },
    ],
  },
  functions: `
vec2 bulgePinchRadial(vec2 p, vec2 center, float strength, float radius, float falloff) {
  vec2 offset = p - center;
  float dist = length(offset);
  if (dist < 0.0001) return p;
  float n = dist / max(radius, 0.001);
  float f = pow(1.0 - smoothstep(0.0, 1.0, n), falloff);
  float r = dist * (1.0 + strength * f);
  return center + normalize(offset) * r;
}

vec2 fisheyeRadial(vec2 p, vec2 center, float strength, float aspect) {
  vec2 d = (p - center) * vec2(aspect, 1.0);
  float r = length(d);
  if (r < 0.0001) return p;
  float r2 = r * r;
  float rNew = r * (1.0 + strength * r2);
  vec2 dNorm = d / r;
  vec2 dNew = dNorm * rNew / vec2(aspect, 1.0);
  return center + dNew;
}

vec2 spherizeRadial(vec2 p, vec2 center, float radius, float strength) {
  vec2 d = (p - center) / max(radius, 0.001);
  float r = length(d);
  if (r >= 1.0) return p;
  float r2 = r * r;
  float f = 1.0 - r2;
  float z = sqrt(max(0.0, f));
  float theta = atan(d.y, d.x);
  float phi = atan(z, r);
  float rNew = mix(r, phi * 2.0 / 3.14159, strength);
  vec2 dNew = vec2(cos(theta), sin(theta)) * rNew * radius;
  return center + dNew;
}
`,
  mainCode: `
  vec2 warpCenter = vec2($param.warpCenterX, $param.warpCenterY);
  vec2 outUv = $input.in;
  if ($param.warpMode == 0) {
    outUv = bulgePinchRadial($input.in, warpCenter, $param.bulgeStrength, $param.bulgeRadius, $param.bulgeFalloff);
  } else if ($param.warpMode == 1) {
    outUv = fisheyeRadial($input.in, warpCenter, $param.fisheyeStrength, $param.fisheyeAspect);
  } else {
    outUv = spherizeRadial($input.in, warpCenter, $param.spherizeRadius, $param.spherizeStrength);
  }
  $output.out = outUv;
`,
};
