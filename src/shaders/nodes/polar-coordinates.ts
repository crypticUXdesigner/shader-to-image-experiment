import type { NodeSpec } from '../../types/nodeSpec';

export const polarCoordinatesNodeSpec: NodeSpec = {
  id: 'polar-coordinates',
  category: 'Distort',
  displayName: 'Polar Coords',
  description: 'Converts Cartesian coordinates to polar coordinates, enabling radial/rotational effects',
  icon: 'asterisk-simple',
  inputs: [
    {
      name: 'in',
      type: 'vec2',
      label: 'UV'
    }
  ],
  outputs: [
    {
      name: 'out',
      type: 'vec2',
      label: 'Polar UV'
    }
  ],
  parameters: {
    polarCenterX: {
      type: 'float',
      default: 0.0,
      min: -2.0,
      max: 2.0,
      step: 0.1,
      label: 'Center X',
      knobPolarity: 'two-sided' },
    polarCenterY: {
      type: 'float',
      default: 0.0,
      min: -2.0,
      max: 2.0,
      step: 0.1,
      label: 'Center Y',
      knobPolarity: 'two-sided' },
    polarScale: {
      type: 'float',
      default: 1.0,
      min: 0.1,
      max: 10.0,
      step: 0.01,
      label: 'Angular Scale'
    },
    polarRadiusScale: {
      type: 'float',
      default: 1.0,
      min: 0.1,
      max: 10.0,
      step: 0.01,
      label: 'Radial Scale'
    },
    polarRotation: {
      type: 'float',
      default: 0.0,
      min: -6.28,
      max: 6.28,
      step: 0.05,
      label: 'Rotation',
      knobPolarity: 'two-sided' }
  },
  parameterLayout: {
    elements: [
      {
        type: 'grid',
        parameters: ['polarCenterX', 'polarCenterY', 'polarScale', 'polarRadiusScale', 'polarRotation'],
        parameterUI: { polarCenterX: 'coords', polarCenterY: 'coords' },
        layout: { columns: 3, coordsSpan: 2, parameterSpan: { polarRotation: 2 } }
      }
    ]
  },
  functions: `
vec2 toPolar(vec2 p, vec2 center) {
  vec2 offset = p - center;
  float angle = atan(offset.y, offset.x);
  float radius = length(offset);
  return vec2(angle / 3.14159, radius); // Normalize angle to -1..1
}

vec2 fromPolar(vec2 polar, vec2 center) {
  float angle = polar.x * 3.14159;
  float radius = polar.y;
  return center + vec2(cos(angle), sin(angle)) * radius;
}
`,
  mainCode: `
    vec2 polarCenter = vec2($param.polarCenterX, $param.polarCenterY);
    vec2 polarP = toPolar($input.in, polarCenter);
    polarP.x *= $param.polarScale;
    polarP.y *= $param.polarRadiusScale;
    polarP.x += $param.polarRotation;
    $output.out = fromPolar(polarP, polarCenter);
  `
};
